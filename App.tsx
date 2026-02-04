// services/geminiService.ts

// 在 ClientSideService 类中修改 importPlugin 方法
async importPlugin(code: string): Promise<boolean> {
    try {
        this.log("正在解析插件脚本...");
        
        // 模拟 CommonJS 的环境，定义一个空的 exports 对象
        const module = { exports: {} as any };
        
        // 使用 Function 构造器执行代码
        // code 是你读取的 JS 文件内容字符串
        const pluginFunc = new Function('module', 'exports', code);
        pluginFunc(module, module.exports);
        
        // 获取脚本导出的对象
        const plugin = module.exports;
        
        // 基础验证：必须包含 id, name 和 search 方法
        if (plugin.id && plugin.name && typeof plugin.search === 'function') {
            // 如果已存在同 ID 插件，先移除（实现覆盖安装）
            this.plugins = this.plugins.filter(p => p.id !== plugin.id);
            
            // 将插件存入内存数组
            this.plugins.push(plugin);
            this.log(`插件 [${plugin.name}] 安装成功`);
            return true;
        } else {
            this.log("插件格式错误：缺少必要字段或 search 方法");
            return false;
        }
    } catch (e: any) {
        this.log(`插件加载失败: ${e.message}`);
        return false;
    }
}
