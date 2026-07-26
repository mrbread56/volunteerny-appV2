const fs = require('fs');
const readline = require('readline');

async function processTranscript() {
  const transcriptPath = 'C:\\Users\\ASUS\\.gemini\\antigravity\\brain\\a6592b49-e09f-437f-b562-9cebef0b3c16\\.system_generated\\logs\\transcript.jsonl';
  const fileStream = fs.createReadStream(transcriptPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let homeContent = fs.readFileSync('src/pages/Home.tsx', 'utf8');

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const data = JSON.parse(line);
      if (data.type === 'PLANNER_RESPONSE' && data.tool_calls) {
        for (const tc of data.tool_calls) {
          if (tc.name === 'write_to_file') {
             const target = tc.args.TargetFile || '';
             if (target.includes('Home.tsx')) {
                homeContent = tc.args.CodeContent;
             }
          }
          if (tc.name === 'replace_file_content') {
             const target = tc.args.TargetFile || '';
             if (target.includes('Home.tsx')) {
                const search = tc.args.TargetContent;
                const replace = tc.args.ReplacementContent;
                homeContent = homeContent.replace(search, replace);
             }
          }
          if (tc.name === 'multi_replace_file_content') {
             const target = tc.args.TargetFile || '';
             if (target.includes('Home.tsx')) {
                const chunks = tc.args.ReplacementChunks || [];
                for (const chunk of chunks) {
                   homeContent = homeContent.replace(chunk.TargetContent, chunk.ReplacementContent);
                }
             }
          }
        }
      }
    } catch (e) {
      // skip invalid JSON lines
    }
  }

  fs.writeFileSync('src/pages/Home.tsx', homeContent, 'utf8');
  console.log("Successfully rebuilt Home.tsx from transcript patches!");
}

processTranscript();
