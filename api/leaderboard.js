const {db,guard,fail}=require('../lib/backend');
module.exports=async(req,res)=>{if(!guard(req,res,['GET']))return;try{
 const page=Math.max(0,Math.min(1000,parseInt(req.query.page)||0));
 const data=await db('/rest/v1/rpc/public_ranking',{method:'POST',body:{p_week:req.query.period==='week',p_offset:page*20}});
 res.json({players:data,page});
}catch(e){fail(res,e);}};
