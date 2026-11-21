import os
import re
import subprocess
import markdown

def build_pdf():
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    md_path = os.path.join(project_root, "docs", "MyCoin_Whitepaper_v4.md")
    if not os.path.exists(md_path):
        md_path = os.path.join(project_root, "🪙 Zero-Cost Serverless Cryptographic Ledger (v3).md")

    html_output_path = os.path.join(project_root, "docs", "MyCoin_Modern.html")
    pdf_output_path = os.path.join(project_root, "docs", "MyCoin.pdf")
    root_pdf_path = os.path.join(project_root, "MyCoin.pdf")

    with open(md_path, "r", encoding="utf-8") as f:
        md_text = f.read()

    # Clean up duplicate title header from markdown since hero cover handles it
    md_text = re.sub(
        r"^# 🪙 MyCoin: Zero-Cost Serverless Cryptographic Ledger \(v4 Whitepaper\)[\s\S]*?Target Infrastructure:[^\n]*\n+---\n+",
        "",
        md_text,
        flags=re.MULTILINE
    )

    # Clean up ladder emoji if missing font
    md_text = md_text.replace("12. 🪜", "12. 🗺️")

    # Ensure list items have clean spacing so they parse into individual <li>
    md_text = re.sub(r"^\*\s+", "\n- ", md_text, flags=re.MULTILINE)

    # Clean up LaTeX formulas to clean Unicode / math styling for perfect offline print rendering
    md_text = md_text.replace(r"\sqrt{k \cdot s} > \sqrt{s}", "√(k · s) > √(s)")
    md_text = md_text.replace(r"\sqrt{k \cdot s > \sqrt{s", "√(k · s) > √(s)")
    md_text = md_text.replace(r"\mathbf{120,000", "120,000")
    md_text = md_text.replace(r"\mathbf{", "").replace(r"}", "")
    md_text = md_text.replace(r"\times", "×")
    md_text = md_text.replace(r"\approx", "≈")
    md_text = md_text.replace(r"\rightarrow", "→")
    md_text = md_text.replace(r"\parallel", " ∥ ")
    md_text = md_text.replace(r"\text{MB}", "MB")
    md_text = md_text.replace(r"\text{", "").replace(r"}", "")
    md_text = md_text.replace(r"10^{15}", "1,000,000,000,000,000")
    md_text = md_text.replace(r"2^{53} - 1", "2⁵³ - 1")
    md_text = md_text.replace(r"2^{24}", "2²⁴ (16.7M)")
    md_text = md_text.replace(r"2^{50}", "2⁵⁰")
    md_text = md_text.replace(r"2^{50", "2⁵⁰")
    md_text = md_text.replace(r"\$", "$")

    # Replace display math $$ ... $$ with elegant styled math box
    def replace_math_block(match):
        formula = match.group(1).strip()
        formula = formula.replace(r"\_", "_").replace(r"\,", " ").replace(r"\ ", " ")
        formula = formula.replace("{", "").replace("}", "")
        return f'''
<div class="math-box">
  <div class="math-tag">MATHEMATICAL SPECIFICATION</div>
  <div class="math-formula">{formula}</div>
</div>
'''
    md_text = re.sub(r"\$\$(.*?)\$\$", replace_math_block, md_text, flags=re.DOTALL)

    # Replace inline math $ ... $ with styled inline formula span
    def replace_inline_math(match):
        formula = match.group(1).strip()
        formula = formula.replace(r"\_", "_").replace(r"\,", " ").replace("{", "").replace("}", "")
        return f'<span class="inline-math">{formula}</span>'
    md_text = re.sub(r"\$([^\$\n]+)\$", replace_inline_math, md_text)

    # Process callouts: > [!NOTE], > [!IMPORTANT], > [!TIP], > [!WARNING]
    def replace_callout(match):
        kind = match.group(1).upper()
        content = match.group(2).strip()
        
        icon = "📌"
        title = "Executive Summary"
        css_class = "callout-note"
        
        if "IMPORTANT" in kind:
            icon = "🎯"
            title = "Core Design Mandate"
            css_class = "callout-important"
        elif "WARNING" in kind or "CAUTION" in kind:
            icon = "⚠️"
            title = "Security Alert"
            css_class = "callout-warning"
        elif "TIP" in kind:
            icon = "💡"
            title = "Architectural Pro-Tip"
            css_class = "callout-tip"

        clean_lines = []
        for line in content.split("\n"):
            line = re.sub(r"^>\s?", "", line)
            clean_lines.append(line)
        inner_md = "\n".join(clean_lines)
        inner_html = markdown.markdown(inner_md, extensions=['extra', 'tables', 'fenced_code'])

        return f'''
<div class="callout {css_class}">
  <div class="callout-header"><span class="callout-icon">{icon}</span> <span>{title}</span></div>
  <div class="callout-body">{inner_html}</div>
</div>
'''

    md_text = re.sub(r">\s*\[!(NOTE|IMPORTANT|TIP|WARNING|CAUTION)\]\s*\n((?:>.*\n?)+)", replace_callout, md_text)

    # Convert Markdown to HTML
    body_html = markdown.markdown(
        md_text,
        extensions=['extra', 'tables', 'fenced_code']
    )

    # Wrap code/diagrams into macOS terminal frames
    def wrap_terminal(match):
        code_content = match.group(1)
        title = "Architecture & Flow Specification"
        
        # Check specific diagram types first
        if "Phase 1:" in code_content or "visual_testbench.html" in code_content:
            title = "🗺️ Phased Implementation & Verification Roadmap"
        elif "CREATE TABLE" in code_content:
            title = "🗄️ SQLite Durable Object Schema Definition"
        elif "CENTRALIZED BOT" in code_content:
            title = "⚖️ System Paradigm Comparison"
        elif "ALICE: The Gamer" in code_content:
            title = "🌟 User Journey & End-to-End Transaction Flow"
        elif "TIER 0:" in code_content:
            title = "🛡️ Asymmetric Wallet Tier State Machine"
        elif "Hourly Epoch Settlement" in code_content:
            title = "🗄️ Lazy Merkle Tree Settlement Flow"
        elif "MYCOIN_TX_V1" in code_content:
            title = "🔐 Canonical Tagged Serialization Format"

        return f'''
<div class="terminal-window">
  <div class="terminal-bar">
    <div class="terminal-dots">
      <span class="dot dot-red"></span>
      <span class="dot dot-yellow"></span>
      <span class="dot dot-green"></span>
    </div>
    <div class="terminal-title">{title}</div>
    <div class="terminal-actions">UTF-8 SPEC</div>
  </div>
  <pre class="terminal-pre"><code>{code_content}</code></pre>
</div>
'''
    body_html = re.sub(r"<pre><code>(.*?)</code></pre>", wrap_terminal, body_html, flags=re.DOTALL)

    # Replace badge keywords in tables and text
    def replace_badges(content):
        content = re.sub(r"\b(VERIFIED|PASSED)\b", r'<span class="pill pill-green">\1</span>', content)
        content = re.sub(r"\b(FIXED|APPROVED)\b", r'<span class="pill pill-indigo">\1</span>', content)
        content = re.sub(r"\b(PENDING|IN-PROGRESS)\b", r'<span class="pill pill-amber">\1</span>', content)
        content = re.sub(r"\b(STRICTLY NO|NEVER|FAILED)\b", r'<span class="pill pill-red">\1</span>', content)
        content = re.sub(r"(\$0\.00 Forever|\$0 Forever)", r'<span class="pill pill-green">\1</span>', content)
        return content

    body_html = replace_badges(body_html)

    # Hero Header Section
    hero_header = '''
<div class="hero-cover">
  <div class="hero-badge-row">
    <span class="badge badge-emerald">🟢 100% Free Forever ($0/Mo)</span>
    <span class="badge badge-indigo">⚡ Cloudflare Edge & SQLite DO</span>
    <span class="badge badge-cyan">🔒 Non-Custodial (Ed25519)</span>
    <span class="badge badge-purple">⛓️ Bitcoin OpenTimestamps</span>
    <span class="badge badge-amber">📱 Mobile & Web Native</span>
    <span class="badge badge-slate">🚀 v4.0 Final Specification</span>
  </div>
  <h1 class="hero-title">🪙 MyCoin</h1>
  <p class="hero-subtitle">Zero-Cost Serverless Cryptographic Ledger</p>
  <p class="hero-tagline">A mathematically tamper-evident, non-custodial micro-currency engineered to operate permanently at $0 running cost across Discord, Telegram, Web, and IoT without requiring a credit card or always-on servers.</p>
  
  <div class="meta-grid">
    <div class="meta-card">
      <div class="meta-label">LEAD ARCHITECT</div>
      <div class="meta-val">Aditya Gusain</div>
    </div>
    <div class="meta-card">
      <div class="meta-label">DATE & EDITION</div>
      <div class="meta-val">November 2026 • v4 Spec</div>
    </div>
    <div class="meta-card">
      <div class="meta-label">PROTOTYPE STATE</div>
      <div class="meta-val">Milestone 1 Verified (Ed25519)</div>
    </div>
    <div class="meta-card">
      <div class="meta-label">OPERATING BUDGET</div>
      <div class="meta-val">Strictly $0.00 / No Credit Card</div>
    </div>
  </div>
</div>
'''

    full_html = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>MyCoin: Zero-Cost Serverless Cryptographic Ledger (v4)</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Fira+Code:wght@400;500;600&display=swap');

  :root {{
    --text-primary: #0f172a;
    --text-secondary: #334155;
    --border-color: #e2e8f0;
    --terminal-bg: #0b1120;
  }}

  * {{
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }}

  body {{
    font-family: 'Plus Jakarta Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: var(--text-primary);
    background: #ffffff;
    line-height: 1.68;
    font-size: 13px;
    margin: 0;
    padding: 0;
  }}

  @page {{
    size: A4;
    margin: 14mm 14mm 16mm 14mm;
    @bottom-right {{
      content: "Page " counter(page);
      font-size: 9px;
      color: #94a3b8;
      font-weight: 600;
      font-family: 'Plus Jakarta Sans', sans-serif;
    }}
    @bottom-left {{
      content: "🪙 MyCoin Protocol Whitepaper (v4.0) • Zero-Cost Serverless Ledger";
      font-size: 9px;
      color: #94a3b8;
      font-weight: 600;
      font-family: 'Plus Jakarta Sans', sans-serif;
    }}
  }}

  /* Hero Cover */
  .hero-cover {{
    background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 55%, #2e1065 100%);
    color: #ffffff;
    border-radius: 16px;
    padding: 30px 34px;
    margin-bottom: 22px;
    box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.25);
    border: 1px solid rgba(255, 255, 255, 0.12);
    page-break-after: avoid;
    break-after: avoid;
  }}

  .hero-badge-row {{
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    margin-bottom: 14px;
  }}

  .badge {{
    font-size: 9.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 3px 9px;
    border-radius: 9999px;
    display: inline-block;
  }}

  .badge-emerald {{ background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.35); }}
  .badge-indigo {{ background: rgba(99, 102, 241, 0.2); color: #a5b4fc; border: 1px solid rgba(99, 102, 241, 0.35); }}
  .badge-cyan {{ background: rgba(6, 182, 212, 0.2); color: #67e8f9; border: 1px solid rgba(6, 182, 212, 0.35); }}
  .badge-purple {{ background: rgba(168, 85, 247, 0.2); color: #d8b4fe; border: 1px solid rgba(168, 85, 247, 0.35); }}
  .badge-amber {{ background: rgba(245, 158, 11, 0.2); color: #fcd34d; border: 1px solid rgba(245, 158, 11, 0.35); }}
  .badge-slate {{ background: rgba(148, 163, 184, 0.2); color: #e2e8f0; border: 1px solid rgba(148, 163, 184, 0.35); }}

  .hero-title {{
    font-size: 32px;
    font-weight: 800;
    margin: 0 0 2px 0;
    letter-spacing: -0.5px;
    background: linear-gradient(to right, #ffffff, #c7d2fe, #67e8f9);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }}

  .hero-subtitle {{
    font-size: 17px;
    font-weight: 600;
    color: #e0e7ff;
    margin: 0 0 10px 0;
  }}

  .hero-tagline {{
    font-size: 12px;
    color: #94a3b8;
    max-width: 95%;
    margin: 0 0 20px 0;
    line-height: 1.55;
  }}

  .meta-grid {{
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    background: rgba(15, 23, 42, 0.65);
    padding: 12px 16px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }}

  .meta-card {{
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    padding-right: 6px;
  }}
  .meta-card:last-child {{
    border-right: none;
  }}

  .meta-label {{
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: 0.6px;
    color: #94a3b8;
    margin-bottom: 2px;
  }}

  .meta-val {{
    font-size: 11px;
    font-weight: 700;
    color: #f8fafc;
  }}

  /* Typography */
  h1, h2, h3, h4 {{
    color: var(--text-primary);
    font-weight: 700;
    margin-top: 22px;
    margin-bottom: 10px;
    page-break-after: avoid;
    break-after: avoid;
  }}

  h2 {{
    font-size: 18px;
    border-bottom: 2px solid #e2e8f0;
    padding-bottom: 5px;
    margin-top: 26px;
    color: #1e1b4b;
    display: flex;
    align-items: center;
    gap: 8px;
  }}

  h3 {{
    font-size: 14px;
    color: #334155;
    margin-top: 16px;
    border-left: 3px solid #6366f1;
    padding-left: 8px;
  }}

  p {{
    margin: 0 0 9px 0;
    color: var(--text-secondary);
  }}

  ul, ol {{
    margin: 0 0 12px 0;
    padding-left: 20px;
    color: var(--text-secondary);
  }}

  li {{
    margin-bottom: 5px;
  }}

  strong {{
    color: var(--text-primary);
  }}

  /* Callout Alert Boxes */
  .callout {{
    border-radius: 10px;
    padding: 12px 16px;
    margin: 14px 0;
    border-left: 4px solid;
    page-break-inside: avoid;
    break-inside: avoid;
  }}

  .callout-header {{
    font-size: 12.5px;
    font-weight: 700;
    margin-bottom: 5px;
    display: flex;
    align-items: center;
    gap: 6px;
  }}

  .callout-body p:last-child {{
    margin-bottom: 0;
  }}

  .callout-note {{
    background: #f0fdf4;
    border-left-color: #10b981;
    color: #064e3b;
  }}
  .callout-note .callout-header {{ color: #047857; }}

  .callout-important {{
    background: #eef2ff;
    border-left-color: #6366f1;
    color: #1e1b4b;
  }}
  .callout-important .callout-header {{ color: #4338ca; }}

  .callout-warning {{
    background: #fffbeb;
    border-left-color: #f59e0b;
    color: #78350f;
  }}
  .callout-warning .callout-header {{ color: #b45309; }}

  .callout-tip {{
    background: #ecfeff;
    border-left-color: #06b6d4;
    color: #164e63;
  }}
  .callout-tip .callout-header {{ color: #0e7490; }}

  /* Math Box */
  .math-box {{
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 10px 14px;
    margin: 12px 0;
    text-align: center;
    page-break-inside: avoid;
    break-inside: avoid;
  }}

  .math-tag {{
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: 0.8px;
    color: #6366f1;
    margin-bottom: 4px;
    text-transform: uppercase;
  }}

  .math-formula {{
    font-family: 'Fira Code', 'Cascadia Code', Consolas, monospace;
    font-size: 12px;
    font-weight: 600;
    color: #0f172a;
    letter-spacing: 0.3px;
  }}

  .inline-math {{
    font-family: 'Fira Code', Consolas, monospace;
    font-weight: 600;
    color: #4338ca;
    background: #eef2ff;
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 11.5px;
  }}

  /* Terminal Window for Code and ASCII Diagrams */
  .terminal-window {{
    background: var(--terminal-bg);
    border-radius: 9px;
    margin: 12px 0 16px 0;
    box-shadow: 0 6px 16px rgba(15, 23, 42, 0.22);
    overflow: hidden;
    border: 1px solid #1e293b;
    page-break-inside: avoid;
    break-inside: avoid;
  }}

  .terminal-bar {{
    background: #1e293b;
    padding: 5px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid #334155;
  }}

  .terminal-dots {{
    display: flex;
    gap: 5px;
  }}

  .dot {{
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
  }}
  .dot-red {{ background: #ef4444; }}
  .dot-yellow {{ background: #f59e0b; }}
  .dot-green {{ background: #10b981; }}

  .terminal-title {{
    font-size: 10px;
    font-weight: 600;
    color: #94a3b8;
    font-family: 'Fira Code', Consolas, monospace;
    letter-spacing: 0.3px;
  }}

  .terminal-actions {{
    font-size: 8.5px;
    color: #64748b;
    font-family: 'Fira Code', Consolas, monospace;
    font-weight: 700;
  }}

  .terminal-pre {{
    margin: 0;
    padding: 11px 14px;
    background: var(--terminal-bg);
    overflow-x: auto;
  }}

  .terminal-pre code {{
    font-family: 'Fira Code', 'Cascadia Code', Consolas, 'Courier New', monospace;
    font-size: 10px;
    line-height: 1.42;
    color: #38bdf8;
    white-space: pre;
    display: block;
  }}

  /* Inline Code */
  p code, li code {{
    background: #f1f5f9;
    color: #4338ca;
    padding: 1.5px 5px;
    border-radius: 4px;
    font-size: 11px;
    font-family: 'Fira Code', Consolas, monospace;
    font-weight: 500;
    border: 1px solid #e2e8f0;
  }}

  /* Modern Tables */
  table {{
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    margin: 14px 0 18px 0;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--border-color);
    box-shadow: 0 1px 3px rgba(0,0,0,0.02);
    page-break-inside: avoid;
    break-inside: avoid;
    font-size: 11.5px;
  }}

  th {{
    background: linear-gradient(to right, #1e1b4b, #312e81);
    color: #ffffff;
    font-weight: 700;
    text-align: left;
    padding: 9px 12px;
    border-bottom: 2px solid #4338ca;
  }}

  td {{
    padding: 8px 12px;
    border-bottom: 1px solid #f1f5f9;
    color: #334155;
    vertical-align: top;
  }}

  tr:nth-child(even) td {{
    background: #f8fafc;
  }}

  tr:last-child td {{
    border-bottom: none;
  }}

  /* Badges & Pills */
  .pill {{
    display: inline-block;
    padding: 2px 7px;
    border-radius: 10px;
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.3px;
    text-transform: uppercase;
  }}

  .pill-green {{ background: #dcfce7; color: #15803d; border: 1px solid #86efac; }}
  .pill-indigo {{ background: #e0e7ff; color: #4338ca; border: 1px solid #a5b4fc; }}
  .pill-amber {{ background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }}
  .pill-red {{ background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }}

  hr {{
    border: none;
    border-top: 1px solid #e2e8f0;
    margin: 24px 0;
  }}

  .footer-note {{
    text-align: center;
    font-size: 10.5px;
    color: #94a3b8;
    margin-top: 30px;
    padding-top: 14px;
    border-top: 1px solid #e2e8f0;
  }}
</style>
</head>
<body>

{hero_header}

<div class="content-body">
{body_html}
</div>

<div class="footer-note">
  🪙 <strong>MyCoin Protocol Specification (v4.0)</strong> • Open Research & Architecture • Strictly $0/Month Hosting Forever
</div>

</body>
</html>
'''

    with open(html_output_path, "w", encoding="utf-8") as f:
        f.write(full_html)
    print(f"✅ HTML written to {html_output_path} ({len(full_html)} bytes)")

    edge_exe = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
    cmd = [
        edge_exe,
        "--headless=new",
        "--disable-gpu",
        "--no-pdf-header-footer",
        f"--print-to-pdf={pdf_output_path}",
        os.path.abspath(html_output_path)
    ]
    print(f"🚀 Running Edge headless to compile PDF...")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode == 0 and os.path.exists(pdf_output_path):
        import shutil
        shutil.copyfile(pdf_output_path, root_pdf_path)
        root_html = os.path.join(project_root, "MyCoin_Modern.html")
        shutil.copyfile(html_output_path, root_html)
        size = os.path.getsize(pdf_output_path)
        print(f"🎉 SUCCESS! High-quality PDF generated at: {pdf_output_path} ({size} bytes)")
    else:
        print(f"❌ Error generating PDF: {result.stderr}")

if __name__ == "__main__":
    build_pdf()
