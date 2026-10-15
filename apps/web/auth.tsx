import{createContext,useCallback,useContext,useEffect,useState,type ReactNode} from "react";
import{apiRequest,setApiLanguage,tokenStore,type Language} from "./client.ts";
export type Role="attendee"|"organizer"|"admin";
export interface Me{
    id:string;
    email:string;
    role:Role;
    language:Language;
    emailVerified:boolean;
}
interface AuthState {
    user: Me | null;
    loading: boolean;
    login: (email: string, password: string) => Promise<Me>;
    register: (email: string, password: string, language: Language) => Promise<void>;
    logout: () => void;
    refreshMe:Promise<void>;
    setLanguage:(lang:Language)=>Promise<void>;
}
const Ctx=createContext<AuthState|null>(null);
export function AuthProvider({children}:{children:ReactNode}) {
    const [user, setUser] = useState<Me | null>(null);
    const [loading, setLoading] = useState(true);
    const refreshMe = useCallback(async () => {
        if (!tokenStore.getAccess() && !tokenStore.getRefresh()) {
            setUser(null);
            setLoading(false);
            return;
        }
        try {
            const me = await apiRequest<Me>("/me");
            setUser(me);
            setApiLanguage(me.language);
        } catch {
            tokenStore.clear();
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        refreshMe();
    }, [refreshMe]);
    const login = useCallback(async (email: string, password: string) => {
        const data = await apiRequest<{ accessToken: string; refreshToken: string; user: Me }>("auth/login",
            {
                method: "POST",
                auth: false,
                body: {email, password},
            });
        tokenStore.set(data.accessToken, data.refreshToken);
        setUser(data.user);
        setApiLanguage(data.user.language);
        return data.user;
    }, []);
    const register = useCallback(async (email: string, password: string, language: Language) => {
        await apiRequest("auth/register", {
            method: "POST",
            auth: false,
            body: {email, password, language},
        });
    }, []);
    const logout = useCallback(() => {
        tokenStore.clear();
        setUser(null);
    }, []);
    const setLanguage = useCallback(async (lang: Language) => {
        setApiLanguage(lang);
        if (user) {
            const updated = await apiRequest<Me>("/me", {method: "PATCH", body: {language: lang}});
            setUser(updated);
        }
    }, [user]);
    return(<Ctx.Provider value={{user,loading,login,logout,register,refreshMe,setLanguage}}>
    {children}
</Ctx.Provider>
);
}
export function useAuth():AuthState{
    const ctx=useContext(Ctx);
    if(!ctx) throw new Error("useAuth() must be used within <AuthProvider>");
    return ctx;
}

