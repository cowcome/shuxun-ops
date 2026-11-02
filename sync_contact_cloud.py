#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""云端同步：企微智能表格 -> contact_data.json（供 GitHub Actions 定时调用）。

原理：用智能机器人 secret 换 access_token，再调 smartsheet get_records 拉全量，
转为网页格式写入 web/contact_data.json。脚本本身只用 Python 标准库。

环境变量：
  WECOM_BOT_ID      机器人 ID（API 模式）
  WECOM_BOT_SECRET  机器人 Secret（API 模式，存仓库 Secrets）
  OUT_PATH          可选，输出文件路径，默认 <脚本目录>/web/contact_data.json

本地调试：python sync_contact_cloud.py --from-file sample.json
"""
import os, sys, json, hashlib, time, urllib.request, datetime

DOCID = "s3_ADQA63hgAOICNvjH1S0msTtOE0ibg_a"   # 書荀总部通讯录（企微智能表格）
SHEET_ID = "CoNrfa"                            # 子表「通讯录」
DEPT_ORDER = ["高层", "财务部", "网络营销部", "监察部", "人事部", "产品部",
              "工程部", "教育部", "市场拓展", "人力资源", "文宣部"]

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_PATH = os.environ.get("OUT_PATH", os.path.join(HERE, "web", "contact_data.json"))


def get_val(v):
    """兼容企微两种返回：文本字段是 [{text,type}] 数组，电话字段是字符串。"""
    if isinstance(v, list):
        return "".join(x.get("text", "") for x in v if isinstance(x, dict))
    return "" if v is None else str(v)


def http_post(url, body):
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data,
                                 headers={"Content-Type": "application/json"})
    raw = urllib.request.urlopen(req, timeout=30).read().decode("utf-8")
    return json.loads(raw)


def get_token():
    bot_id = os.environ["WECOM_BOT_ID"]
    secret = os.environ["WECOM_BOT_SECRET"]
    ts = str(int(time.time()))
    nonce = "sync" + ts
    sig = hashlib.sha256((secret + bot_id + ts + nonce).encode("utf-8")).hexdigest()
    resp = http_post("https://qyapi.weixin.qq.com/cgi-bin/aibot/get_token",
                    {"bot_id": bot_id, "time": int(ts), "nonce": nonce, "signature": sig})
    if resp.get("errcode") != 0:
        raise RuntimeError("get_token failed: " + json.dumps(resp, ensure_ascii=False))
    return resp["access_token"]


def get_records(token):
    out, offset = [], 0
    while True:
        body = {"docid": DOCID, "sheet_id": SHEET_ID,
                "key_type": "CELL_VALUE_KEY_TYPE_FIELD_TITLE",
                "offset": offset, "limit": 1000}
        url = ("https://qyapi.weixin.qq.com/cgi-bin/wedoc/smartsheet/get_records"
               "?access_token=" + token)
        resp = http_post(url, body)
        if resp.get("errcode") != 0:
            raise RuntimeError("get_records failed: " + json.dumps(resp, ensure_ascii=False))
        out.extend(resp.get("records", []))
        if not resp.get("has_more"):
            break
        offset = resp.get("next", offset + 1000)
    return out


def build(recs):
    people = []
    for r in recs:
        v = r.get("values", {})
        people.append({
            "name": get_val(v.get("姓名")),
            "dept": get_val(v.get("部门")),
            "title": get_val(v.get("职位")),
            "phone": get_val(v.get("电话")),
            "duty": get_val(v.get("职责")),
        })
    people.sort(key=lambda p: DEPT_ORDER.index(p["dept"]) if p["dept"] in DEPT_ORDER else 99)
    bj = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=8)
    return {"updated": bj.strftime("%Y-%m-%d %H:%M"), "count": len(people), "people": people}


def main():
    if len(sys.argv) > 2 and sys.argv[1] == "--from-file":
        with open(sys.argv[2], encoding="utf-8") as f:
            data = json.load(f)
        recs = data.get("records", [])
        print("本地样本模式：记录数", len(recs))
    else:
        if not os.environ.get("WECOM_BOT_ID") or not os.environ.get("WECOM_BOT_SECRET"):
            raise SystemExit("缺少环境变量 WECOM_BOT_ID / WECOM_BOT_SECRET")
        token = get_token()
        recs = get_records(token)
        print("企微拉取记录数", len(recs))

    result = build(recs)

    # 与线上现有文件比对，无变化则不写，避免无意义 commit
    if os.path.exists(OUT_PATH):
        with open(OUT_PATH, encoding="utf-8") as f:
            old = f.read()
        new = json.dumps(result, ensure_ascii=False, indent=2)
        if old == new:
            print("NO_CHANGE")
            return

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print("已生成", OUT_PATH, "| 人数", result["count"], "| 更新", result["updated"])


if __name__ == "__main__":
    main()
