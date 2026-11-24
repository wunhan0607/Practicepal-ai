// Verify the user's JWT before every read/write; use their token with RLS.
const url=(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const key=process.env.SUPABASE_ANON_KEY;
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!['GET','PUT'].includes(req.method)){res.setHeader('Allow','GET, PUT');return res.status(405).json({error:'Method not allowed'})}
 if(!url||!key)return res.status(503).json({error:'Supabase is not configured'});
 const token=/^Bearer (.+)$/i.exec(req.headers.authorization||'')?.[1];
 if(!token)return res.status(401).json({error:'Sign in required'});
 const headers={apikey:key,Authorization:'Bearer '+token};
 try{
  const identity=await fetch(url+'/auth/v1/user',{headers});
  if(!identity.ok)return res.status(401).json({error:'Invalid or expired session'});
  const user=await identity.json();
  if(!user.id||user.is_anonymous)return res.status(401).json({error:'Authenticated teacher required'});
  const endpoint=url+'/rest/v1/teacher_data';
  if(req.method==='GET'){
   const response=await fetch(endpoint+'?teacher_id=eq.'+encodeURIComponent(user.id)+'&select=students,lessons',{headers});
   if(!response.ok)throw Error('Database read failed ('+response.status+')');
   const rows=await response.json();
   if(!rows.length)return res.status(404).json({error:'No cloud data yet'});
   return res.status(200).json({students:rows[0].students,integratedLessons:rows[0].lessons});
  }
  const state=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(!state||!Array.isArray(state.students)||!Array.isArray(state.integratedLessons))return res.status(400).json({error:'Invalid PracticePal state'});
  const response=await fetch(endpoint+'?on_conflict=teacher_id',{
   method:'POST',headers:{...headers,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},
   body:JSON.stringify({teacher_id:user.id,students:state.students,lessons:state.integratedLessons,updated_at:new Date().toISOString()})
  });
  if(!response.ok)throw Error('Database save failed ('+response.status+')');
  return res.status(200).json({ok:true});
 }catch(error){console.error('PracticePal data error:',error);return res.status(500).json({error:'Cloud data unavailable'})}
}
