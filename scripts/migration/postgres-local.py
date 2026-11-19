"""Run the spike on a new loopback-only disposable PostgreSQL cluster; no existing DB touched."""
import os,pathlib,subprocess,tempfile,socket,shutil
bindir=subprocess.check_output(['pg_config','--bindir'],text=True).strip()
with tempfile.TemporaryDirectory(prefix='proinspect-spike-') as tmp:
 data=str(pathlib.Path(tmp)/'data')
 with socket.socket() as sock:
  sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
 subprocess.run([bindir+'/initdb','-D',data,'-A','trust','--no-locale','-E','UTF8'],check=True,stdout=subprocess.DEVNULL)
 subprocess.run([bindir+'/pg_ctl','-D',data,'-l',tmp+'/postgres.log','-o',f'-h 127.0.0.1 -p {port} -k {tmp}','-w','start'],check=True,stdout=subprocess.DEVNULL)
 try:
  subprocess.run([bindir+'/createdb','-h','127.0.0.1','-p',str(port),'proinspect_spike'],check=True)
  env=dict(os.environ,SPIKE_DATABASE_URL=f'postgresql://127.0.0.1:{port}/proinspect_spike')
  result=subprocess.run(['node','--test','tests/migration/postgres.test.mjs'],env=env)
 finally: subprocess.run([bindir+'/pg_ctl','-D',data,'-m','fast','-w','stop'],check=True,stdout=subprocess.DEVNULL)
 raise SystemExit(result.returncode)
