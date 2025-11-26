import { authStore } from "./database.js";

export const authDb = async (empresaId)=>{
    return {
        state:{
            creds: await authStore.get(empresaId,"creds") || {},
            keys:{
                get: async(type,ids)=>{
                    const out = {};
                    for(const id of ids){
                        const key = await authStore.get(empresaId,`${type}-${id}`);
                        if(key) out[id]=key;
                    }
                    return out;
                },
                set: async(data)=>{
                    for(const type in data){
                        for(const id in data[type]){
                            await authStore.set(empresaId,`${type}-${id}`,data[type][id]);
                        }
                    }
                }
            }
        },
        saveCreds: async()=> {
            await authStore.set(empresaId,"creds", this.state.creds);
        }
    };
};