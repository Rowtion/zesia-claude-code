import{fileURLToPath}from'node:url';
import{consultOverA2A as invoke}from'@zesia/runtime/a2a';
export{preflightConsult,CONSULT_MEDIA_TYPE,A2A_PROTOCOL_VERSION}from'@zesia/runtime/a2a';
export function consultOverA2A(options){return invoke({...options,cliBinary:options.cliBinary||process.env.ZESIA_A2A_CLI||fileURLToPath(new URL('../bin/a2a'+(process.platform==='win32'?'.exe':''),import.meta.url))});}
