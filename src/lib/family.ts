import {prisma} from './prisma';
export async function ownedLearner(accountId:string,learnerId:string){return prisma.user.findFirst({where:{id:learnerId,isActive:true,OR:[{id:accountId},{parentUserId:accountId}]}});}
