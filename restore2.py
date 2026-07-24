import json
import codecs

transcript_path = r'C:\Users\ASUS\.gemini\antigravity\brain\a6592b49-e09f-437f-b562-9cebef0b3c16\.system_generated\logs\transcript.jsonl'
home_code = None
css_code = None

with codecs.open(transcript_path, 'r', 'utf-8') as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            data = json.loads(line)
            if data.get('type') == 'PLANNER_RESPONSE':
                for tc in data.get('tool_calls', []):
                    if tc['name'] == 'write_to_file':
                        target = tc.get('args', {}).get('TargetFile', '')
                        if 'Home.tsx' in target:
                            home_code = tc['args']['CodeContent']
                        if 'index.css' in target:
                            css_code = tc['args']['CodeContent']
        except Exception as e:
            pass

if home_code:
    with codecs.open('src/pages/Home.tsx', 'w', 'utf-8') as f:
        f.write(home_code)
    print("Successfully restored Home.tsx")

if css_code:
    with codecs.open('src/index.css', 'w', 'utf-8') as f:
        f.write(css_code)
    print("Successfully restored index.css")
