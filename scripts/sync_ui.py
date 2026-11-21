import os

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    html_path = os.path.join(root, "public", "index.html")
    ts_path = os.path.join(root, "src", "ui.ts")

    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()

    # Escape for TypeScript template string
    escaped = html.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")

    with open(ts_path, "w", encoding="utf-8") as f:
        f.write("export const WALLET_HTML = `" + escaped + "`;\n")

    print(f"Successfully compiled {html_path} to {ts_path} ({len(html)} chars)")

if __name__ == "__main__":
    main()
