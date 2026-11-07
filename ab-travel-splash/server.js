// Chhota static server: web/ aur node_modules/three ko serve karta hai.
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = __dirname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
function start(port = 0) {
  return new Promise(res => {
    const srv = http.createServer((req, resp) => {
      let u = decodeURIComponent(req.url.split('?')[0]);
      if (u === '/') u = '/web/index.html';
      const f = path.join(ROOT, path.normalize(u));
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { resp.writeHead(404); return resp.end(); }
      resp.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(resp);
    });
    srv.listen(port, '127.0.0.1', () => res(srv));
  });
}
module.exports = { start };
if (require.main === module) start(8080).then(s => console.log('http://127.0.0.1:' + s.address().port));
