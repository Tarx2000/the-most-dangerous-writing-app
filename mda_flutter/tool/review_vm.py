"""Invoke review-only VM helpers, without requiring an expression compiler."""
import argparse
import json
import urllib.parse
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('uri')
parser.add_argument('function', choices=[
    'startFrameProbe', 'stopFrameProbe', 'previewWriting',
    'previewDangerEarly', 'previewDangerMiddle', 'previewDangerLate', 'previewDeath',
    'previewHideKeyboard',
])
args = parser.parse_args()
base = args.uri.replace('ws://', 'http://').removesuffix('/ws').rstrip('/') + '/'

def rpc(method, **params):
    with urllib.request.urlopen(base + method + '?' + urllib.parse.urlencode(params), timeout=8) as response:
        result = json.load(response)
    if 'error' in result:
        raise RuntimeError(result['error'])
    return result['result']

isolate_id = rpc('getVM')['isolates'][0]['id']
library_id = rpc('getIsolate', isolateId=isolate_id)['rootLib']['id']
result = rpc('invoke', isolateId=isolate_id, targetId=library_id,
    selector=args.function, argumentIds='[]')
if result.get('kind') == 'String':
    print(result.get('valueAsString'))
else:
    print(json.dumps({'kind': result.get('kind'), 'value': result.get('valueAsString')}))
