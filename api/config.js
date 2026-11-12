const {guard,db}=require('../lib/backend');
module.exports=async(req,res)=>{if(!guard(req,res,['GET']))return;let rules;try {rules=await db('/rest/v1/rpc/game_rules',{method:'POST',body:{}});}catch{} res.json({rules,url:process.env.SUPABASE_URL||'',key:process.env.SUPABASE_ANON_KEY||'',enabled:!!(process.env.SUPABASE_URL&&process.env.SUPABASE_ANON_KEY&&process.env.SUPABASE_SERVICE_ROLE_KEY)});};
