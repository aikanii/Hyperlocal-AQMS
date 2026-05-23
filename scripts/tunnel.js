const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('[HY-AQMS Tunnel] Starting localtunnel on port 3000...');
const lt = spawn('npx', ['-y', 'localtunnel', '--port', '3000'], { shell: true });

let urlFound = false;

lt.stdout.on('data', (data) => {
  const output = data.toString();
  console.log(`[localtunnel] ${output.trim()}`);

  const match = output.match(/your url is:\s+(https:\/\/[a-z0-9-.]+\.loca\.lt)/i);
  if (match && !urlFound) {
    const url = match[1];
    urlFound = true;
    console.log(`[HY-AQMS Tunnel] Successfully obtained tunnel URL: ${url}`);

    // Update api_url.json
    const configPath = path.join(__dirname, '../frontend/public/api_url.json');
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    fs.writeFileSync(configPath, JSON.stringify({ url }, null, 2));
    console.log(`[HY-AQMS Tunnel] Wrote to frontend/public/api_url.json`);

    // Git commit & push
    console.log('[HY-AQMS Tunnel] Pushing updated API URL to GitHub...');
    const gitAdd = spawn('git', ['add', 'frontend/public/api_url.json'], { shell: true });
    gitAdd.on('close', () => {
      const gitCommit = spawn('git', ['commit', '-m', `deploy: update dynamic tunnel URL to ${url}`], { shell: true });
      gitCommit.on('close', () => {
        const gitPush = spawn('git', ['push', 'origin', 'main'], { shell: true });
        gitPush.on('close', (code) => {
          if (code === 0) {
            console.log('[HY-AQMS Tunnel] Successfully pushed updated URL to GitHub!');
          } else {
            console.error('[HY-AQMS Tunnel] Git push failed. Please verify credentials or internet connection.');
          }
        });
      });
    });
  }
});

lt.stderr.on('data', (data) => {
  console.error(`[localtunnel error] ${data.toString().trim()}`);
});

lt.on('close', (code) => {
  console.log(`[localtunnel closed] Exit code: ${code}`);
  process.exit(code);
});
