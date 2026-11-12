import{createTools as shared}from'@zesia/runtime/tools';
import{consultOverA2A}from'./a2a.mjs';
export * from'@zesia/runtime/tools';
export function createTools(options={}){return shared({requestConsult:consultOverA2A,...options});}
