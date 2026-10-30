-- A revoked rule may only be restored as a new candidate, with validation reset.
-- Prevent rule-state and rule-validate from reviving its old approval indirectly.
do $migration$
declare definition text;
begin
 select pg_get_functiondef('private.grcon_allocation_assistant(uuid,text,jsonb)'::regprocedure) into definition;
 if position('Regra revogada: restaure como candidata' in definition)>0 then return;end if;
 if position('if operation=''rule-restore'' then' in definition)=0 then
  raise exception 'Unexpected allocation assistant function; inspect before changing.';
 end if;
 definition:=replace(definition,'if operation=''rule-restore'' then',$guard$if rule.state='revoked' and operation<>'rule-restore' then
   raise exception 'Regra revogada: restaure como candidata e valide novamente.';
  end if;
  if operation='rule-restore' then$guard$);
 execute definition;
end $migration$;
