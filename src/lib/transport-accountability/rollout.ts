/** Planning can open before cutover; physical-trip controls switch only on the service date. */
export function transportRollout(enabled:boolean,enabledFrom:string|null,today:string,planner:boolean){
 if(!enabled||!enabledFrom)return {enabled:false,active:false};
 const active=enabledFrom<=today;
 return {enabled:active||planner,active,preparing:!active,planningDate:active?today:enabledFrom,operationalFrom:enabledFrom};
}
