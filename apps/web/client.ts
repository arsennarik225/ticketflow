const API_BASE=(import.meta as any).env?.VITA_API_URL ?? "http://localhost:8000/v1";
export type Language="kk"|"ru"|"en";
export function toAPILanguage(uiLang:"kz"|"ru"|"en"):Language{
    return uiLang==="kz"?"kk":uiLang;
}
export interface ApiErrorBody{
    error:{
        code:string;
        message:string;
        details?:Record<string,unknown>;
    };
}
export class ApiError extends Error{
    status:number;
    code:string;
    details:Record<string,unknown>;
    constructor(status:number,body:ApiErrorBody) {
        super(body?.error?.message??"Request failed");
        this.status=status;
        this.code=body?.error?.message??"unknown_error";
        this.details=body?.error?.details;
    }
}
const ACCESS_KEY="bf_access_token";
const REFRESH_KEY="bf_refresh_token";
export const tokenStore={
    getAccess:():string|null=>sessionStorage.getItem(ACCESS_KEY),
    getRefresh:():string|null=>sessionStorage.getItem(REFRESH_KEY),
    set:(access:string,refresh:string)=>{
        sessionStorage.setItem(ACCESS_KEY,access);
        sessionStorage.setItem(REFRESH_KEY,refresh);
    },
    clear:()=>{
        sessionStorage.removeItem(ACCESS_KEY);
        sessionStorage.removeItem(REFRESH_KEY);
    },
};
let currentLanguage:Language="kk";
export function setApiLanguage(lang:Language){
    currentLanguage=lang;
}
export function getApiLanguage(lang:Language){
    return currentLanguage;
}
let refreshing: Promise<void>|null=null;
async function doRefresh():Promise<void>{
    const refresh=tokenStore.getRefresh();
    if(!refresh) {
        throw new ApiError(401, {error: {code: "no_refresh_token", message: "Not signed in"}});
    }
    const res=await fetch(`${API_BASE}/auth/refresh`,{method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({refreshToken:refresh}),});
    if(!res.ok){
        tokenStore.clear();
        throw new ApiError(res.status,await res.json().catch(()=>({error:{code:"refresh_failed",message:res.statusText}})));
    }
    const data=await res.json();
    tokenStore.set(data.accessToken,data.refreshToken);
}
export interface RequestOptions extends Omit<RequestInit,"body">{
    body?:unknown;
    auth?:boolean;
    idempotencyKey?:string;
    skipRetry?:boolean;
}
export async function apiRequest<T>(path:string,opts:RequestOptions={}):Promise<T>{
    const{body,auth=true,idempotencyKey,skipRetry,headers,...rest}=opts;
    const h=new Headers(headers);
    if(body!==undefined) h.set("Content-Type","application/json");
    h.set("Accept-Language",currentLanguage);
    if(idempotencyKey) h.set("Idempotency-Key",idempotencyKey);
    if(auth){
        const token=tokenStore.getAccess();
        if(token) h.set("Authorization",`Bearer ${token}`);
    }
    const res=await fetch(`${API_BASE}${path}`,{...rest,headers:h,body:body===undefined?undefined:JSON.stringify(body),});
    if(res.status===401&&auth&&!skipRetry) {
        refreshing ??= doRefresh().finally(() => {
            refreshing = null;
        });
        try {
            await refreshing;
        } catch (e) {
            tokenStore.clear();
            if(typeof window!=="undefined") window.location.assign("/login");
            throw e;
        }
        return apiRequest<T>(path,{...opts,skipRetry:true});
    }
    if(res.status===204) return undefined as T;
    const json=await res.json().catch(()=>({}));
    if(!res.ok) throw new ApiError(res.status,json as ApiErrorBody);
    return json as T;
}
export function formatKZT(amountTenge:number):string{
    return '${(amountTenge/100).toLocaleString("ru-RU")}₸';
}
export function newIdempotencyKey():string{
    return crypto.randomUUID();
}
export async function fetchAuthedImg(path:string):Promise<string>{
    const token=tokenStore.getAccess();
    const res=await fetch(`${API_BASE}${path}`,{headers:token?{Authorization:`Bearer:${token}`}:undefined,});
    if(!res.ok){
        const body=await res.json().catch(()=>({error:{code:"image_fetch_fail",message:res.statusText}}));
        throw new ApiError(res.status,body);
    }
    const blob=await res.blob;
    return URL.createObjectURL(blob);
}

