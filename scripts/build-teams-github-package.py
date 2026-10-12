"""Build Power Automate packages from a current exported operational flow.

The importer must map Teams and GitHub to existing authorized connections.
The operational package updates the same flow, preserving its webhook URL.
"""
import argparse,copy,json,pathlib,uuid,zipfile,datetime
p=argparse.ArgumentParser();p.add_argument('operational_export');p.add_argument('interactive_export');p.add_argument('output_directory');p.add_argument('--repository',required=True);p.add_argument('--tenant',required=True);p.add_argument('--test-recipient',required=True);args=p.parse_args()
out=pathlib.Path(args.output_directory);out.mkdir(parents=True,exist_ok=True)
def read(path):
 with zipfile.ZipFile(path) as z: return {n:json.loads(z.read(n)) for n in z.namelist() if n.endswith('.json')}
base=read(args.operational_export);interactive=read(args.interactive_export)
root=next(n for n in base if n.endswith('/definition.json'));saved=base[root];definition=saved['properties']['definition']
original=copy.deepcopy(definition['actions']);legacy_name=next(n for n in original if n.startswith('Publicar_'))
legacy=copy.deepcopy(original[legacy_name]);legacy['runAfter']={}
wait=copy.deepcopy(next(v for n,v in interactive.items() if n.endswith('/definition.json'))['properties']['definition']['actions']['Tem_tentativa_de_rastreabilidade']['actions']['Aguardar_postado_no_Teams'])
wait['runAfter']={};wait['inputs']['parameters']['body/body/updateMessage']='Resposta recebida. Registrando a declaração no GRCON. Acompanhar conferência no SIGEM.'
chat=wait['inputs']['parameters']['body/body/recipient/recipient']
team=wait['inputs']['host'];gh={'apiId':'/providers/Microsoft.PowerApps/apis/shared_github','connectionName':'shared_github'}
owner,repository=args.repository.split('/')
def after(name,statuses=None):return {name:statuses or ['Succeeded']}
def compose(value,deps=None):return {'type':'Compose','inputs':value,'runAfter':deps or {}}
def action(host,operation,parameters,deps=None):return {'type':'OpenApiConnection','inputs':{'host':{**host,'operationId':operation},'parameters':parameters,'authentication':"@parameters('$authentication')",'retryPolicy':{'type':'none'}},'runAfter':deps or {}}
def issue(title,body,deps=None):return action(gh,'CreateIssue',{'repositoryOwner':owner,'repositoryName':repository,'title':title,'body':body},deps)
def terminate(message,deps=None):return {'type':'Terminate','inputs':{'runStatus':'Failed','runError':{'code':'GRCON_CONFIRMATION_REJECTED','message':message}},'runAfter':deps or {}}
all_status=['Succeeded','Failed','TimedOut','Skipped']
response={'schema':'grcon-teams-github-v1','kind':'confirm','attemptId':"@body('Parse_JSON')?['traceability']?['attemptId']",'workspaceId':"@body('Parse_JSON')?['traceability']?['workspaceId']",'messageId':"@string(body('Aguardar_postado')?['messageId'])",'conversationId':chat,'messageUrl':"@coalesce(body('Aguardar_postado')?['messageLink'],'')",'type':"@body('Aguardar_postado')?['data']?['type']",'selection':"@coalesce(body('Aguardar_postado')?['data']?['selection'],'')",'respondedAt':"@outputs('Capturar_horario')",'responder':"@body('Aguardar_postado')?['responder']"}
valid="@and(equals(body('Aguardar_postado')?['responder']?['tenantId'],'"+args.tenant+"'),not(empty(body('Aguardar_postado')?['responder']?['objectId'])),not(empty(body('Aguardar_postado')?['responder']?['displayName'])),not(empty(body('Aguardar_postado')?['messageId'])),or(equals(body('Aguardar_postado')?['data']?['type'],'total'),and(equals(body('Aguardar_postado')?['data']?['type'],'partial'),greater(length(body('Validar_indices')),0),less(length(body('Validar_indices')),int(body('Parse_JSON')?['egrdt']?['documentCount'])),equals(length(body('Validar_indices')),length(outputs('Indices_selecionados'))))))"
effects={'schema':'grcon-teams-github-v1','kind':'effects','attemptId':response['attemptId'],'workspaceId':response['workspaceId'],'messageId':response['messageId'],'conversationId':chat,'confirmationIssueId':"@string(body('Guardar_confirmacao')?['id'])",'cardUpdated':"@equals(actions('Atualizar_cartao')?['status'],'Succeeded')",'noticeStatus':"@if(equals(outputs('Retorno_GRCON')?['publishConfirmation'],false),'skipped',if(equals(actions('Publicar_confirmacao')?['status'],'Succeeded'),'sent','uncertain'))",'replyMessageId':"@coalesce(actions('Publicar_confirmacao')?['outputs']?['body']?['id'],'')"}
html="@replace(replace(replace(replace(outputs('Retorno_GRCON')?['confirmationText'],'&','&amp;'),'<','&lt;'),'>','&gt;'),decodeUriComponent('%0A'),'<br>')"
approved={
 'Atualizar_cartao':action(team,'UpdateCardInConversation',{'poster':'Flow bot','location':'Group chat','body/recipient':chat,'body/messageId':response['messageId'],'body/messageBody':"@outputs('Retorno_GRCON')?['updatedCard']"}),
 'Anunciar_uma_vez':{'type':'If','expression':"@equals(outputs('Retorno_GRCON')?['publishConfirmation'],true)",'actions':{'Publicar_confirmacao':action(team,'PostMessageToConversation',{'poster':'Flow bot','location':'Group chat','body/recipient':chat,'body/messageBody':html})},'else':{'actions':{}},'runAfter':{}},
 'Efeitos_no_Teams':compose(effects,{'Atualizar_cartao':all_status,'Anunciar_uma_vez':all_status}),
 'Guardar_efeitos':issue("@concat('[GRCON] effects ',body('Parse_JSON')?['traceability']?['attemptId'])","@string(outputs('Efeitos_no_Teams'))",after('Efeitos_no_Teams'))}
poll={'type':'Until','expression':"@equals(body('Ler_retorno')?['state'],'closed')",'limit':{'count':60,'timeout':'PT10M'},'actions':{'Ler_retorno':action(gh,'GetIssueNum',{'repositoryOwner':owner,'repositoryName':repository,'issueNumber':"@body('Guardar_confirmacao')?['number']"}),'Aguardar_sincronizacao':{'type':'If','expression':"@not(equals(body('Ler_retorno')?['state'],'closed'))",'actions':{'Intervalo':{'type':'Wait','inputs':{'interval':{'count':10,'unit':'Second'}},'runAfter':{}}},'else':{'actions':{}},'runAfter':after('Ler_retorno')}},'runAfter':after('Guardar_confirmacao')}
valid_actions={'Resposta':compose(response),'Guardar_confirmacao':issue("@concat('[GRCON] confirm ',body('Parse_JSON')?['traceability']?['attemptId'])","@string(outputs('Resposta'))",after('Resposta')),'Esperar_GRCON':poll,'Retorno_GRCON':compose("@json(body('Ler_retorno')?['body'])?['result']",after('Esperar_GRCON')),'Confirmacao_aceita':{'type':'If','expression':"@equals(outputs('Retorno_GRCON')?['ok'],true)",'actions':approved,'else':{'actions':{'Nao_confirmar':terminate('O GRCON rejeitou o registro; conferir o fluxo antes de reenviar.')}},'runAfter':after('Retorno_GRCON')}}
process={'Aguardar_postado':wait,'Capturar_horario':compose('@utcNow()',after('Aguardar_postado')),'Indices_selecionados':compose("@if(equals(body('Aguardar_postado')?['data']?['type'],'partial'),split(coalesce(body('Aguardar_postado')?['data']?['selection'],''),','),json('[]'))",after('Capturar_horario')),'Validar_indices':{'type':'Query','inputs':{'from':"@range(0,int(body('Parse_JSON')?['egrdt']?['documentCount']))",'where':"@contains(outputs('Indices_selecionados'),string(item()))"},'runAfter':after('Indices_selecionados')},'Resposta_valida':{'type':'If','expression':valid,'actions':valid_actions,'else':{'actions':{'Nao_confirmar_resposta_invalida':terminate('Resposta inválida do Teams. Nenhuma postagem foi confirmada no GRCON.')}},'runAfter':after('Validar_indices')}}
for kind,status in [('expired','TimedOut'),('failed','Failed')]:
 process['Registrar_'+kind]=issue("@concat('[GRCON] "+kind+" ',body('Parse_JSON')?['traceability']?['attemptId'])", "@string(setProperty(setProperty(setProperty(json('{\"schema\":\"grcon-teams-github-v1\",\"kind\":\""+kind+"\"}'),'attemptId',body('Parse_JSON')?['traceability']?['attemptId']),'workspaceId',body('Parse_JSON')?['traceability']?['workspaceId']),'source','Teams'))",after('Aguardar_postado',[status]))
main=copy.deepcopy(definition)
main['actions']={n:copy.deepcopy(v) for n,v in original.items() if n!=legacy_name}
main['actions']['Tem_tentativa_de_rastreabilidade']={'type':'If','expression':"@not(empty(body('Parse_JSON')?['traceability']?['attemptId']))",'actions':process,'else':{'actions':{legacy_name:legacy}},'runAfter':copy.deepcopy(original[legacy_name]['runAfter'])}

def package(model,name,filename,creation='Update'):
 files=copy.deepcopy(base);data=files[root];data['properties']['definition']=model;data['properties']['displayName']=name
 data['properties']['connectionReferences']['shared_github']={'connectionName':'shared_github','source':'Embedded','id':'/providers/Microsoft.PowerApps/apis/shared_github','tier':'NotSpecified','apiName':'github','isProcessSimpleApiReferenceConversionAlreadyDone':False}
 api=str(uuid.uuid4());conn=str(uuid.uuid4());flow_id=files['Microsoft.Flow/flows/manifest.json']['flowAssets']['assetPaths'][0]
 files[root.replace('definition.json','apisMap.json')]['shared_github']=api
 files[root.replace('definition.json','connectionsMap.json')]['shared_github']=conn
 manifest=files['manifest.json'];manifest['details']['displayName']=filename.removesuffix('.zip');manifest['details']['description']='Conectores padrão Teams e GitHub. Mapear conexões existentes e validar antes de ativar rastreabilidade.';manifest['details']['createdTime']=datetime.datetime.now(datetime.timezone.utc).isoformat();manifest['details']['packageTelemetryId']=str(uuid.uuid4())
 manifest['resources'][flow_id]['details']['displayName']=name;manifest['resources'][flow_id]['suggestedCreationType']=creation;manifest['resources'][flow_id]['dependsOn'] += [api,conn]
 manifest['resources'][api]={'id':'/providers/Microsoft.PowerApps/apis/shared_github','name':'shared_github','type':'Microsoft.PowerApps/apis','suggestedCreationType':'Existing','details':{'displayName':'GitHub','iconUri':'https://connectoricons-prod.azureedge.net/releases/v1.0.1829/1.0.1829.5052/github/icon.png'},'configurableBy':'System','hierarchy':'Child','dependsOn':[]}
 manifest['resources'][conn]={'type':'Microsoft.PowerApps/apis/connections','suggestedCreationType':'Existing','creationType':'Existing','details':{'displayName':owner,'iconUri':manifest['resources'][api]['details']['iconUri']},'configurableBy':'User','hierarchy':'Child','dependsOn':[api]}
 with zipfile.ZipFile(out/filename,'w',zipfile.ZIP_DEFLATED) as z:
  for path,value in files.items():z.writestr(path,json.dumps(value,ensure_ascii=False,separators=(',',':')))
 (out/(filename.removesuffix('.zip')+'.json')).write_text(json.dumps(model,ensure_ascii=False,indent=2)+'\n')
package(main,saved['properties']['displayName'],'GRCON-Teams-GitHub-operacional.zip')

# A separate manual probe sends a clearly labelled test card only to its owner.
probe=copy.deepcopy(definition);probe['triggers']={'manual':{'type':'Request','kind':'Button','inputs':{'schema':{'type':'object','properties':{},'required':[]}}}}
test_card={'type':'AdaptiveCard','version':'1.2','body':[{'type':'TextBlock','text':'TESTE DE INTEGRAÇÃO — NÃO É UMA GRDT','weight':'Bolder','wrap':True},{'type':'TextBlock','text':'Clique em Testar retorno para validar Teams → GitHub → GRCON. Nenhum documento será marcado como postado.','wrap':True}],'actions':[{'type':'Action.Submit','title':'Testar retorno','data':{'probe':True}}]}
probe_wait=copy.deepcopy(wait);probe_wait['inputs']['parameters']={'poster':'Flow bot','location':'Chat with Flow bot','body/body/recipient/to':args.test_recipient,'body/body/messageBody':json.dumps(test_card,ensure_ascii=False),'body/body/updateMessage':'Resposta de teste recebida. Validando o retorno ao GRCON.'};probe_wait['limit']={'timeout':'PT15M'}
probe_record={'schema':'grcon-teams-github-v1','kind':'probe','nonce':'@guid()'}
probe['actions']={'Aguardar_postado':probe_wait,'Resposta':compose(probe_record,after('Aguardar_postado')),'Guardar_confirmacao':issue('[GRCON] probe - teste privado sem GRDT',"@string(outputs('Resposta'))",after('Resposta')),'Esperar_GRCON':copy.deepcopy(poll),'Retorno_GRCON':copy.deepcopy(valid_actions['Retorno_GRCON']),'Teste_aceito':{'type':'If','expression':"@and(equals(outputs('Retorno_GRCON')?['ok'],true),equals(outputs('Retorno_GRCON')?['probe'],outputs('Resposta')?['nonce']))",'actions':{'Informar_teste':action(team,'PostMessageToConversation',{'poster':'Flow bot','location':'Chat with Flow bot','body/recipient/to':args.test_recipient,'body/messageBody':'✅ TESTE APROVADO: Teams → GitHub → GRCON. Nenhuma GRDT foi alterada.'})},'else':{'actions':{'Teste_rejeitado':terminate('O retorno de teste não foi validado.')}},'runAfter':after('Retorno_GRCON')}}
package(probe,'GRCON - Teste privado cartao GitHub','GRCON-Teams-GitHub-teste-privado.zip','New')
def validate(scope,parents=None):
 known=set(scope)|(parents or set())
 for n,a in scope.items():
  assert a['type'] not in ('Http','Response'),n
  assert all(dep in known for dep in a.get('runAfter',{})),n
  if 'host' in a.get('inputs',{}):assert a['inputs']['host']['apiId'].split('/')[-1] in ['shared_teams','shared_github'],n
  if 'actions' in a:validate(a['actions'],known)
  if 'else' in a:validate(a['else']['actions'],known)
validate(main['actions']);validate(probe['actions'])
assert main['triggers']==definition['triggers']
assert main['actions']['Tem_tentativa_de_rastreabilidade']['else']['actions'][legacy_name]['inputs']==original[legacy_name]['inputs']
print(json.dumps({'directory':str(out),'packages':2,'premiumActions':0,'originalTriggerPreserved':True,'legacyCardPreserved':True}))
