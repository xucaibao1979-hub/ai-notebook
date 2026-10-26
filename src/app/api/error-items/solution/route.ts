import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth';
import {prepareErrorSolution} from '@/lib/error-solution';
export async function POST(req:Request){const s=await getServerSession(authOptions);if(!s?.user?.id)return NextResponse.json({message:'请先登录'},{status:401});try{const {id}=await req.json();if(typeof id!=='string')return NextResponse.json({message:'请选择原题'},{status:400});return NextResponse.json(await prepareErrorSolution(s.user.id,id,true));}catch(e){return NextResponse.json({message:e instanceof Error?e.message:'识别失败，请重试'},{status:502});}}
