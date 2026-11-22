#!/usr/bin/env python3
"""
Quettabyte Coin (QBC) - OpenCode Subagent Bridge
Orchestrates local OpenCode execution, context injection, and automated validation.
"""

import os
import sys
import json
import time
import base64
import argparse
import subprocess
import urllib.request
import urllib.error
from pathlib import Path

DEFAULT_PORT = 4096
DEFAULT_USER = "opencode"
DEFAULT_PASS = "zc2Gm1WuXrBZy-Ab4EOqCG0L3syshl7nKKDo6s-_Asc"
DEFAULT_MODEL = "deepseek-v4.1-flash-free"
DEFAULT_PROVIDER = "opencode"

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CONTEXT_FILE = PROJECT_ROOT / ".opencode" / "CONTEXT.md"

def get_auth_header(password=DEFAULT_PASS):
    token = f"{DEFAULT_USER}:{password}"
    return "Basic " + base64.b64encode(token.encode()).decode()

def api_request(path, method="GET", body=None, port=DEFAULT_PORT, password=DEFAULT_PASS, timeout=30):
    url = f"http://127.0.0.1:{port}{path}"
    req = urllib.request.Request(url, method=method)
    req.add_header("Authorization", get_auth_header(password))
    req.add_header("Content-Type", "application/json")
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data=data, timeout=timeout) as resp:
            content = resp.read().decode()
            try:
                return json.loads(content)
            except Exception:
                return content
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        return {"error": f"HTTP {e.code}", "detail": err}
    except Exception as e:
        return {"error": str(e)}

def ensure_server_running(port=DEFAULT_PORT):
    # Check if server responds to /api/info
    res = api_request("/api/info", port=port, timeout=3)
    if isinstance(res, dict) and "version" in res:
        return True
    
    print(f"[*] OpenCode server not responding on port {port}. Starting daemon...")
    env = os.environ.copy()
    env["OPENCODE_SERVER_PASSWORD"] = DEFAULT_PASS
    proc = subprocess.Popen(
        ["opencode", "serve", "--port", str(port)],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    for _ in range(15):
        time.sleep(1)
        res = api_request("/api/info", port=port, timeout=2)
        if isinstance(res, dict) and "version" in res:
            print(f"[+] Server started successfully on port {port} (PID: {proc.pid})")
            return True
    print("[-] Failed to start OpenCode server.")
    return False

def dispatch_task(task_instruction, model_id=DEFAULT_MODEL, provider_id=DEFAULT_PROVIDER, validate=True):
    print("===================================================================")
    print("🤖 QUETTABYTE COIN (QBC) - OPENCODE SUBAGENT DISPATCHER")
    print(f"📌 Model: {provider_id}/{model_id}")
    print("===================================================================")
    
    if not ensure_server_running():
        return {"success": False, "error": "Server unavailable"}
    
    # 1. Read Project Context
    context_text = ""
    if CONTEXT_FILE.exists():
        context_text = CONTEXT_FILE.read_text(encoding="utf-8")
    
    full_prompt = (
        f"You are the subordinate implementation agent for Quettabyte Coin.\n"
        f"Follow the lead of Antigravity (Architect Agent).\n\n"
        f"--- PROJECT CONTEXT ---\n{context_text}\n"
        f"--- TASK INSTRUCTION ---\n{task_instruction}\n\n"
        f"Execute the task with minimal changes, adhere strictly to zero-cost invariants and BigInt micro-units, "
        f"and state clearly what files were inspected or updated."
    )
    
    # 2. Create isolated session
    print("[*] Creating dedicated OpenCode session...")
    sess = api_request("/api/session", method="POST", body={})
    session_id = sess.get("data", {}).get("id") if isinstance(sess, dict) else None
    if not session_id:
        print("[-] Failed to create session:", sess)
        return {"success": False, "error": sess}
    print(f"[+] Session active: {session_id}")
    
    # 3. Post prompt to session
    print("[*] Submitting task instruction to model...")
    prompt_payload = {
        "text": full_prompt,
        "model": {"id": model_id, "providerID": provider_id}
    }
    prompt_res = api_request(f"/api/session/{session_id}/prompt", method="POST", body=prompt_payload)
    if "error" in prompt_res:
        print("[-] Prompt submission failed:", prompt_res)
        return {"success": False, "error": prompt_res}
    
    print("[*] Model thinking & executing tools...")
    start_time = time.time()
    last_thought = ""
    completed = False
    final_output = ""
    
    # 4. Poll until completion or timeout (max 180s)
    final_output = ""
    completed = False
    
    while time.time() - start_time < 180:
        time.sleep(3)
        msgs_res = api_request(f"/api/session/{session_id}/message")
        messages = msgs_res.get("data", []) if isinstance(msgs_res, dict) else []
        
        # Look for the latest assistant message
        for msg in messages:
            msg_type = msg.get("type")
            if msg_type == "assistant":
                content = msg.get("content", [])
                for block in content:
                    b_type = block.get("type")
                    if b_type == "reasoning":
                        thought = block.get("text", "").strip()
                        if thought and thought != last_thought:
                            last_thought = thought
                            print(f"[Thought] {thought[:120]}...", flush=True)
                
                finish = msg.get("finish")
                if finish in ("stop", "completed", "done"):
                    text_parts = [c.get("text", "") for c in content if c.get("type") == "text"]
                    if text_parts:
                        final_output = "\n".join(text_parts)
                    completed = True
                    break
                elif finish == "error":
                    print(f"[-] Execution error: {msg.get('error')}", flush=True)
                    return {"success": False, "error": msg.get("error")}
            elif msg_type == "idle":
                if msg.get("outcome") == "succeeded":
                    completed = True
                    # Check if we already got final_output, if not look in recent assistant messages
                    if not final_output:
                        for prev in messages:
                            if prev.get("type") == "assistant":
                                text_parts = [c.get("text", "") for c in prev.get("content", []) if c.get("type") == "text"]
                                if text_parts:
                                    final_output = "\n".join(text_parts)
                                    break
                    break
                elif msg.get("outcome") == "failed":
                    print(f"[-] Session idle with failure: {msg.get('error')}", flush=True)
                    return {"success": False, "error": msg.get("error")}
        
        if completed:
            break
        print(f"[*] Working... ({int(time.time() - start_time)}s elapsed)", end="\r", flush=True)
    
    print()
    if not completed and not final_output:
        print("[!] Reached polling deadline. Collecting latest output...")
        
    print("\n----------------- OPENCODE WORKER OUTPUT -----------------")
    print(final_output or "(Execution completed)")
    print("----------------------------------------------------------\n")
    
    # 5. Automated Validation Gate
    validation_status = "SKIPPED"
    if validate:
        print("[*] Running Automated Validation Gate (npx tsc --noEmit)...")
        tsc_cmd = ["npx.cmd", "tsc", "--noEmit"] if sys.platform == "win32" else ["npx", "tsc", "--noEmit"]
        try:
            val_proc = subprocess.run(tsc_cmd, cwd=PROJECT_ROOT, capture_output=True, text=True, timeout=30)
            if val_proc.returncode == 0:
                print("✅ [Validation Gate] TypeScript compile passed with ZERO errors!")
                validation_status = "PASSED"
            else:
                print("❌ [Validation Gate] TypeScript errors detected:")
                print(val_proc.stdout[:500])
                validation_status = "FAILED"
        except Exception as e:
            print(f"[!] Validation check warning: {e}")
            validation_status = "ERROR"
            
    return {
        "success": True,
        "session_id": session_id,
        "output": final_output,
        "validation": validation_status
    }

def main():
    parser = argparse.ArgumentParser(description="OpenCode Subagent Bridge for Quettabyte Coin")
    subparsers = parser.add_subparsers(dest="command")
    
    run_parser = subparsers.add_parser("run", help="Dispatch task to OpenCode subagent")
    run_parser.add_argument("--task", required=True, help="Task instruction string")
    run_parser.add_argument("--model", default=DEFAULT_MODEL, help="Model ID (e.g. deepseek-v4.1-flash-free)")
    run_parser.add_argument("--provider", default=DEFAULT_PROVIDER, help="Provider ID (default: opencode)")
    run_parser.add_argument("--no-validate", action="store_true", help="Skip tsc validation")
    
    status_parser = subparsers.add_parser("status", help="Check OpenCode server status")
    
    args = parser.parse_args()
    
    if args.command == "status":
        info = api_request("/api/info")
        print("OpenCode Server Status:", json.dumps(info, indent=2))
    elif args.command == "run":
        res = dispatch_task(
            task_instruction=args.task,
            model_id=args.model,
            provider_id=args.provider,
            validate=not args.no_validate
        )
        sys.exit(0 if res.get("success") else 1)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
