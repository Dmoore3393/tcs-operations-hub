import {jsxDEV as reactJsxDEV} from 'react/jsx-dev-runtime';
import type {ElementType,Key} from 'react';
import {prepare} from './prepare';
export {Fragment} from 'react/jsx-dev-runtime';
export type {JSX} from 'react/jsx-dev-runtime';
export function jsxDEV(type:ElementType,props:Record<string,unknown>|null,key:Key|undefined,isStaticChildren:boolean,source:Parameters<typeof reactJsxDEV>[4],self:Parameters<typeof reactJsxDEV>[5]){const result=prepare(type,props);return reactJsxDEV(result.type as ElementType,result.props,key,isStaticChildren,source,self);}
