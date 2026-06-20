// WSL2内端口转发：0.0.0.0:18976 → 127.0.0.1:8976
import net from 'net';
const srv = net.createServer(c => {
  const r = net.connect(8976, '127.0.0.1');
  c.pipe(r); r.pipe(c);
  c.on('error', () => {});
  r.on('error', () => {});
});
srv.listen(18976, '0.0.0.0', () => console.log('forward 18976→8976'));
