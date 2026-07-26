import json

transcript_path = r'C:\Users\ASUS\.gemini\antigravity\brain\a6592b49-e09f-437f-b562-9cebef0b3c16\.system_generated\logs\transcript.jsonl'
home_code = None
css_code = None

with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            if data.get('type') == 'PLANNER_RESPONSE':
                for tc in data.get('tool_calls', []):
                    if tc['name'] == 'write_to_file':
                        target = tc['args'].get('TargetFile', '')
                        if 'Home.tsx' in target:
                            home_code = tc['args']['CodeContent']
                        if 'index.css' in target:
                            css_code = tc['args']['CodeContent']
        except:
            pass

if home_code:
    with open('src/pages/Home.tsx', 'w', encoding='utf-8') as f:
        f.write(home_code)
    print("Restored Home.tsx")
if css_code:
    with open('src/index.css', 'w', encoding='utf-8') as f:
        f.write(css_code)
    print("Restored index.css")
