"""Set the first synthetic encryption key in each empty migration secret. Never print or rotate keys."""
import base64
import secrets
import subprocess

for stage in ('dev', 'staging'):
    secret = f'proinspect-migration-{stage}-data-encryption-key'
    common = ['--project=proinspect-property-services', '--quiet']
    versions = subprocess.check_output(['gcloud', 'secrets', 'versions', 'list', secret, *common,
                                        '--format=value(name,state)'], text=True).splitlines()
    if not versions:
        key = base64.b64encode(secrets.token_bytes(32))
        subprocess.run(['gcloud', 'secrets', 'versions', 'add', secret, '--data-file=-', *common],
                       input=key, check=True, stdout=subprocess.DEVNULL)
    state = subprocess.check_output(['gcloud', 'secrets', 'versions', 'describe', '1', '--secret='+secret,
                                     *common, '--format=value(state)'], text=True).strip()
    if state != 'ENABLED':
        raise SystemExit(f'{stage}: pinned version 1 is {state}')
    print(f'{stage}: version 1 enabled')
