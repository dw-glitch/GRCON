"""Build reviewable standard-connector flow models from a verified Teams export.

The output is a configuration bundle, not a Power Automate import package.
Supply a real site/list before configuring and validating the two cloud flows.
"""
import argparse, copy, json, pathlib, zipfile

parser = argparse.ArgumentParser()
parser.add_argument('teams_export')
parser.add_argument('output_directory')
parser.add_argument('--site-url', default='PENDENTE_SITE_SHAREPOINT')
parser.add_argument('--list-id', default='PENDENTE_GUID_LISTA')
args = parser.parse_args()
out = pathlib.Path(args.output_directory)
out.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(args.teams_export) as archive:
    original = json.loads(archive.read(next(n for n in archive.namelist() if n.endswith('/definition.json'))))
definition = original['properties']['definition']
actions = definition['actions']
branch = actions['Tem_tentativa_de_rastreabilidade']
legacy = copy.deepcopy(next(iter(branch['else']['actions'].values())))
legacy['runAfter'] = {}
wait_saved = branch['actions']['Aguardar_postado_no_Teams']
card = wait_saved['inputs']['parameters']['body/body/messageBody']
chat = wait_saved['inputs']['parameters']['body/body/recipient/recipient']
team_host = copy.deepcopy(wait_saved['inputs']['host'])
sp_host = {'apiId':'/providers/Microsoft.PowerApps/apis/shared_sharepointonline','connectionName':'shared_sharepointonline'}

def after(name, statuses=None):
    return {name:statuses or ['Succeeded']}

def compose(value, dependencies=None):
    return {'type':'Compose','inputs':value,'runAfter':dependencies or {}}

def connection(host, operation, parameters, dependencies=None, webhook=False, retry=None):
    result = {'type':'OpenApiConnectionWebhook' if webhook else 'OpenApiConnection',
              'inputs':{'host':{**host,'operationId':operation},'parameters':parameters,'authentication':"@parameters('$authentication')"},
              'runAfter':dependencies or {}}
    if retry:
        result['inputs']['retryPolicy'] = retry
    return result

def sp(operation, parameters, dependencies=None):
    return connection(sp_host,operation,{'dataset':args.site_url,'table':args.list_id,**parameters},dependencies)

item_uri = "@concat('_api/web/lists(guid''" + args.list_id + "'')/items(',string(triggerBody()?['ID']),')')"

def rest(method, changes=None, dependencies=None, claim=False):
    headers = {'Accept':'application/json;odata=verbose'}
    if method == 'POST':
        headers.update({'Content-Type':'application/json;odata=nometadata','X-HTTP-Method':'MERGE',
                        'IF-MATCH':"@body('Ler_bloqueio')?['d']?['__metadata']?['etag']" if claim else '*'})
    parameters = {'dataset':args.site_url,'parameters/method':method,'parameters/uri':item_uri,'parameters/headers':headers}
    if changes is not None:
        # Build an object before serialization: responder names/JSON can contain
        # quotes, apostrophes and newlines and must not break the REST body.
        dynamic = {key:value for key,value in changes.items() if isinstance(value,str) and value.startswith('@{')}
        constants = {key:value for key,value in changes.items() if key not in dynamic}
        object_expression = "json('"+json.dumps(constants,ensure_ascii=False).replace("'","''")+"')"
        for key,value in dynamic.items():
            object_expression = f"setProperty({object_expression},'{key}',{value[2:-1]})"
        parameters['parameters/body'] = '@string('+object_expression+')' if dynamic else json.dumps(changes,ensure_ascii=False)
    return connection(sp_host,'HttpRequest',parameters,dependencies,retry={'type':'none'} if claim else {'type':'fixed','count':3,'interval':'PT10S'})

receiver = copy.deepcopy(definition)
receiver['actions']['Tem_tentativa_de_rastreabilidade']['actions'] = {
    'Guardar_pedido':sp('PostItem',{
        'item/Title':"@body('Parse_JSON')?['egrdt']?['number']",
        'item/RequestKey':"@body('Parse_JSON')?['traceability']?['attemptId']",
        'item/WorkspaceId':"@body('Parse_JSON')?['traceability']?['workspaceId']",
        'item/State':'Queued','item/CardJson':card,
        'item/ContextJson':"@string(removeProperty(body('Parse_JSON'),'message'))",
        'item/NoticeStatus':'pending','item/CardUpdated':False})}
receiver['actions']['Tem_tentativa_de_rastreabilidade']['else']['actions'] = {'Publicar_cartao_original':legacy}
receiver['contentVersion']='1.1.0.0'

wait = connection(team_host,'PostCardAndWaitForResponse',{
    'poster':'Flow bot','location':'Group chat','body/body/recipient/recipient':chat,
    'body/body/messageBody':"@body('Ler_pedido')?['CardJson']",
    'body/body/updateMessage':'Resposta recebida. Registrando a declaração no SharePoint; o GRCON fará a sincronização. Acompanhar conferência no SIGEM.'},
    after('Reservar_pedido'),webhook=True,retry={'type':'none'})
wait['limit']={'timeout':'P7D'}
response = {'messageId':"@body('Aguardar_postado')?['messageId']",'conversationId':chat,
            'messageUrl':"@coalesce(body('Aguardar_postado')?['messageLink'],'')",
            'type':"@body('Aguardar_postado')?['data']?['type']",
            'selection':"@coalesce(body('Aguardar_postado')?['data']?['selection'],'')",
            'responder':"@body('Aguardar_postado')?['responder']",'respondedAt':"@outputs('Capturar_horario')"}
text = "@concat('✅ POSTAGEM DECLARADA — GRCON',decodeUriComponent('%0A'),'eGRDT: ',outputs('Contexto')?['egrdt']?['number'],decodeUriComponent('%0A'),'Contrato: ',outputs('Contexto')?['traceability']?['contractCode'],decodeUriComponent('%0A'),'Tipo: ',body('Aguardar_postado')?['data']?['type'],decodeUriComponent('%0A'),'Documentos: ',string(if(equals(body('Aguardar_postado')?['data']?['type'],'total'),outputs('Contexto')?['egrdt']?['documentCount'],length(body('Validar_indices')))),'/',string(outputs('Contexto')?['egrdt']?['documentCount']),decodeUriComponent('%0A'),'Confirmado por: ',body('Aguardar_postado')?['responder']?['displayName'],decodeUriComponent('%0A'),'Data/hora capturada: ',convertTimeZone(outputs('Capturar_horario'),'UTC','E. South America Standard Time','dd/MM/yyyy HH:mm:ss'),decodeUriComponent('%0A'),'Declaração do funcionário registrada no SharePoint. Acompanhar conferência no SIGEM.')"
safe_html = "@replace(replace(replace(replace(outputs('Texto_confirmacao'),'&','&amp;'),'<','&lt;'),'>','&gt;'),decodeUriComponent('%0A'),'<br>')"
updated_card = "@setProperty(removeProperty(json(body('Ler_pedido')?['CardJson']),'actions'),'body',concat(json(body('Ler_pedido')?['CardJson'])?['body'],createArray(setProperty(json('{\"type\":\"TextBlock\",\"text\":\"\",\"wrap\":true}'),'text',outputs('Texto_confirmacao')))))"

valid_actions = {
    'Guardar_resposta':rest('POST',{'State':'Confirmed','ResponseJson':"@{string(outputs('Resposta'))}",'NoticeStatus':'pending'},{}),
    'Texto_confirmacao':compose(text,after('Guardar_resposta')),
    'Atualizar_cartao':connection(team_host,'UpdateCardInConversation',{'poster':'Flow bot','location':'Group chat','body/recipient':chat,
      'body/messageId':"@body('Aguardar_postado')?['messageId']",'body/messageBody':updated_card},after('Texto_confirmacao')),
    'Registrar_cartao':rest('POST',{'CardUpdated':True},after('Atualizar_cartao')),
    'Reservar_anuncio':rest('POST',{'NoticeStatus':'sending'},after('Texto_confirmacao')),
    'Publicar_confirmacao':connection(team_host,'PostMessageToConversation',{'poster':'Flow bot','location':'Group chat','body/recipient':chat,
      'body/messageBody':safe_html},after('Reservar_anuncio'),retry={'type':'none'}),
    'Registrar_anuncio':rest('POST',{'NoticeStatus':'sent','ReplyMessageId':"@{body('Publicar_confirmacao')?['id']}"},after('Publicar_confirmacao')),
    'Registrar_incerteza':rest('POST',{'NoticeStatus':'uncertain'},after('Publicar_confirmacao',['Failed','TimedOut']))}
valid = "@and(equals(body('Aguardar_postado')?['responder']?['tenantId'],'9f250032-dc8e-488c-b733-d6b3ef6e8685'),not(empty(body('Aguardar_postado')?['responder']?['objectId'])),not(empty(body('Aguardar_postado')?['responder']?['displayName'])),not(empty(body('Aguardar_postado')?['messageId'])),or(equals(body('Aguardar_postado')?['data']?['type'],'total'),and(equals(body('Aguardar_postado')?['data']?['type'],'partial'),greater(length(body('Validar_indices')),0),less(length(body('Validar_indices')),int(outputs('Contexto')?['egrdt']?['documentCount'])),equals(length(body('Validar_indices')),length(outputs('Indices_selecionados'))))))"
process = {
    'Reservar_pedido':rest('POST',{'State':'Processing'},claim=True),
    'Aguardar_postado':wait,
    'Capturar_horario':compose('@utcNow()',after('Aguardar_postado')),
    'Resposta':compose(response,after('Capturar_horario')),
    'Indices_selecionados':compose("@if(equals(body('Aguardar_postado')?['data']?['type'],'partial'),split(coalesce(body('Aguardar_postado')?['data']?['selection'],''),','),json('[]'))",after('Resposta')),
    'Validar_indices':{'type':'Query','inputs':{'from':"@range(0,int(outputs('Contexto')?['egrdt']?['documentCount']))",'where':"@contains(outputs('Indices_selecionados'),string(item()))"},'runAfter':after('Indices_selecionados')},
    'Resposta_valida':{'type':'If','expression':valid,'actions':valid_actions,'else':{'actions':{'Resposta_invalida':rest('POST',{'State':'Failed'})}},'runAfter':after('Validar_indices')},
    'Registrar_expiracao':rest('POST',{'State':'Expired'},after('Aguardar_postado',['TimedOut'])),
    'Registrar_falha':rest('POST',{'State':'Failed'},after('Aguardar_postado',['Failed']))}
consumer = {'$schema':definition['$schema'],'contentVersion':'1.1.0.0','parameters':copy.deepcopy(definition['parameters']),
    'triggers':{'Quando_pedido_criado':{'type':'OpenApiConnection','inputs':{'host':{**sp_host,'operationId':'GetOnNewItems'},
      'parameters':{'dataset':args.site_url,'table':args.list_id},'authentication':"@parameters('$authentication')"},
      'recurrence':{'frequency':'Minute','interval':1},'splitOn':"@triggerOutputs()?['body/value']"}},
    'actions':{
      'Ler_pedido':sp('GetItem',{'id':"@triggerBody()?['ID']"}),
      'Contexto':compose("@json(body('Ler_pedido')?['ContextJson'])",after('Ler_pedido')),
      'Ler_bloqueio':rest('GET',dependencies=after('Contexto')),
      'Pedido_disponivel':{'type':'If','expression':"@equals(body('Ler_bloqueio')?['d']?['State'],'Queued')",'actions':process,'else':{'actions':{}},'runAfter':after('Ler_bloqueio')}}}

columns = [{'name':'RequestKey','type':'Text','required':True,'unique':True,'indexed':True},
           {'name':'WorkspaceId','type':'Text','required':True,'indexed':True},
           {'name':'State','type':'Choice','choices':['Queued','Processing','Confirmed','Expired','Failed'],'required':True},
           *[{'name':name,'type':'Note','plainText':True} for name in ['CardJson','ContextJson','ResponseJson']],
           {'name':'NoticeStatus','type':'Choice','choices':['pending','sending','sent','uncertain']},
           {'name':'ReplyMessageId','type':'Text'},{'name':'CardUpdated','type':'Boolean','default':False}]
for name,value in [('01-receber-pedido.json',receiver),('02-confirmar-no-teams.json',consumer),('lista-sharepoint.json',{'title':'GRCON-Teams-Postagens','columns':columns,'writers':'Conta proprietária das conexões e administradores autorizados','reader':'Aplicativo GRCON somente leitura desta lista','siteUrl':args.site_url,'listId':args.list_id})]:
    (out/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')

def validate(scope, outer=None):
    known=set(scope)|(outer or set())
    for name,action in scope.items():
        assert action['type'] not in ['Http','Response'],name
        assert all(dep in known for dep in action.get('runAfter',{})),name
        if 'host' in action.get('inputs',{}):
            assert action['inputs']['host']['apiId'].split('/')[-1] in ['shared_teams','shared_sharepointonline'],name
        if 'actions' in action: validate(action['actions'],known)
        if 'else' in action: validate(action['else']['actions'],known)
validate(receiver['actions']);validate(consumer['actions'])
assert 'runtimeConfiguration' not in consumer['triggers']['Quando_pedido_criado'], 'Do not serialize seven-day waits globally.'
(out/'README.txt').write_text('Modelos revisáveis para dois fluxos com conectores padrão. NÃO é um pacote de importação do Power Automate. Não ativar com placeholders. Criar primeiro a lista privada no site autorizado, configurar conexões/destino, conferir zero ações Premium e validar com postagem real. Ler docs/teams-sharepoint-standard.md no repositório.\n')
print(json.dumps({'directory':str(out),'premiumActions':0,'siteConfigured':args.site_url.startswith('https://'),'listConfigured':not args.list_id.startswith('PENDENTE')},ensure_ascii=False))
