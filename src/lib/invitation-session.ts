import type {Session,SupabaseClient} from "@supabase/supabase-js";
export class InvitationSessionError extends Error {
 constructor(){super("Your setup link has expired or this browser lost its sign-in session. Request a new setup email below, then open its newest link in the same browser.");this.name="InvitationSessionError";}
}
/** Never change the password for a different account or trust a stale React access token. */
export async function prepareInvitationSession(browser:SupabaseClient,isolated:SupabaseClient,expected:Session){
 const stored=await browser.auth.getSession();
 const candidate=stored.data.session||expected;
 if(!candidate?.access_token||!candidate.refresh_token||candidate.user.id!==expected.user.id)throw new InvitationSessionError();
 const result=await isolated.auth.setSession({access_token:candidate.access_token,refresh_token:candidate.refresh_token});
 if(result.error||!result.data.session){
  if(result.error&&/fetch|network|timeout|connection/i.test(result.error.message))throw new Error("The Hub could not verify your setup link. Check your connection and try again.");
  throw new InvitationSessionError();
 }
 const verified=result.data.session;
 if(verified.user.id!==expected.user.id||verified.user.email?.toLowerCase()!==expected.user.email?.toLowerCase())throw new InvitationSessionError();
 return verified;
}
