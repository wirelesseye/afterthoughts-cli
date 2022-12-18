import { defaultConfig } from "afterthoughts";
import deepmerge from "deepmerge";
import type { UserConfig, AftConfig } from "afterthoughts";

export function defineConfig(userConfig: UserConfig) {
    const config = {...defaultConfig};
    
    if (userConfig.site?.navigation) {
        config.site.navigation = {};
    }
    
    return deepmerge(config, userConfig) as AftConfig;
}
