import { createEditApi } from './lib/edit-api.js';

function mockExpressApp() {
  const routes = {};
  return { post(p, ...h) { routes['POST '+p]=h; }, get(p,...h){routes['GET '+p]=h;}, _routes: routes };
}
function mockRes() {
  return { _status:200, _body:null, status(c){this._status=c;return this;}, json(b){this._body=b;return this;}, type(){return this;}, send(b){this._body=b;return this;} };
}
async function runMiddlewareChain(handlers, req, res) {
  let idx=0;
  const next = async (err)=>{ if(err)return; if(idx>=handlers.length)return; const h=handlers[idx++]; await h(req,res,next); };
  await next();
}

const calls = {append:[], mark:[], ship:[]};
const app = mockExpressApp();
createEditApi(app, {
  readSource: () => '',
  callMeph: async () => ({}),
  applyShip: async (s, c) => { calls.ship.push({source:s,cloudContext:c}); return {ok:true, elapsed_ms:250, versionId:'v-42'}; },
  appendAuditEntry: async (r) => { calls.append.push(r); return {ok:true, auditId:'aud-1'}; },
  markAuditEntry: async (p) => { calls.mark.push(p); return {ok:true}; },
  widgetScript:'',
});

const handlers = app._routes['POST /__meph__/api/ship'];
const req = {
  user: {role:'owner', email:'owner@acme.com'},
  body: {
    newSource:'src after',
    classification:{type:'destructive', changes:[{kind:'remove_field', table:'Users', field:'email'}]},
    confirmation:'DELETE field email',
    reason:'user requested erasure under gdpr',
  }
};
const res = mockRes();
await runMiddlewareChain(handlers, req, res);

console.log('append calls:', JSON.stringify(calls.append, null, 2));
console.log('ship calls:', JSON.stringify(calls.ship, null, 2));
console.log('mark calls:', JSON.stringify(calls.mark, null, 2));
console.log('res status:', res._status);
console.log('res body:', JSON.stringify(res._body, null, 2));
