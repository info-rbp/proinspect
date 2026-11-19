"""Use the signed-in gcloud identity without printing or persisting its access token."""
import os,subprocess,sys
if len(sys.argv)<3 or sys.argv[1] not in ('bootstrap','foundation'): raise SystemExit('Use bootstrap|foundation followed by Terraform arguments')
token=subprocess.check_output(['gcloud','auth','print-access-token'],text=True).strip()
env=dict(os.environ,GOOGLE_OAUTH_ACCESS_TOKEN=token)
raise SystemExit(subprocess.run(['terraform','-chdir=infra/gcp/'+sys.argv[1],*sys.argv[2:]],env=env).returncode)
