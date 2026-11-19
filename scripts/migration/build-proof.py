"""Build a tracked Git commit only, never upload local credentials or untracked files."""
import pathlib,subprocess,sys,tempfile,tarfile
sha=subprocess.check_output(['git','rev-parse',sys.argv[1] if len(sys.argv)>1 else 'HEAD'],text=True).strip()
with tempfile.TemporaryDirectory(prefix='proinspect-build-') as tmp:
 archive=pathlib.Path(tmp)/'source.tar'
 subprocess.run(['git','archive','--format=tar','--output='+str(archive),sha],check=True)
 source=pathlib.Path(tmp)/'source';source.mkdir()
 with tarfile.open(archive) as tar:tar.extractall(source,filter='data')
 subprocess.run(['gcloud','builds','submit',str(source),'--project=proinspect-property-services','--region=australia-southeast1','--config='+str(source/'infra/gcp/cloudbuild.yaml'),'--gcs-source-staging-dir=gs://proinspect-property-services-migration-builds/source','--substitutions=_SOURCE_SHA='+sha,'--async','--format=json(id,status,logUrl)','--quiet'],check=True)
