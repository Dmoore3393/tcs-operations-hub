import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {normalizeLocation} from "@/lib/location-config";
import {isLicenseeAccessRole,isEmployeeAccessRole} from "@/lib/team-access";
/** Keep the saved main assignment separate from temporary backup access. */
export async function withStaffBackupLocations<T extends {role:string;organization_id:string;locations:string[]}>(admin:SupabaseClient,profile:T){
 if(!isLicenseeAccessRole(profile.role)&&!isEmployeeAccessRole(profile.role))return {...profile,primary_location:null};
 const {data,error}=await admin.from('locations').select('name').eq('organization_id',profile.organization_id).eq('is_active',true).order('name');
 if(error)throw error;
 const original=(profile.locations||[]).filter(location=>location!=='All Locations');
 const primary=original.length===1?original[0]:null;
 const main=primary&&(data||[]).some(site=>normalizeLocation(String(site.name))===normalizeLocation(primary))?primary:null;
 return {...profile,primary_location:main,locations:[...new Set([...(main?[main]:[]),...(data||[]).map(row=>String(row.name))])]};
}
