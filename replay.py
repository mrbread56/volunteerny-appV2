import json
import codecs
import os

transcript_path = r'C:\Users\ASUS\.gemini\antigravity\brain\a6592b49-e09f-437f-b562-9cebef0b3c16\.system_generated\logs\transcript.jsonl'
# Start with the base file that git restored
with codecs.open('src/pages/Home.tsx', 'r', 'utf-8') as f:
    content = f.read()

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
                            content = tc['args']['CodeContent']
                    
                    if tc['name'] == 'replace_file_content':
                        target = tc.get('args', {}).get('TargetFile', '')
                        if 'Home.tsx' in target:
                            target_content = tc['args']['TargetContent']
                            rep_content = tc['args']['ReplacementContent']
                            content = content.replace(target_content, rep_content)
                            
                    if tc['name'] == 'multi_replace_file_content':
                        target = tc.get('args', {}).get('TargetFile', '')
                        if 'Home.tsx' in target:
                            for chunk in tc['args'].get('ReplacementChunks', []):
                                target_content = chunk['TargetContent']
                                rep_content = chunk['ReplacementContent']
                                content = content.replace(target_content, rep_content)
        except Exception as e:
            pass

with codecs.open('src/pages/Home.tsx', 'w', 'utf-8') as f:
    f.write(content)
print("Replayed transcript to Home.tsx")
