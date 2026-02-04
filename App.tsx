// 在 App 组件内部
const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPluginLoading(true);
    const reader = new FileReader();

    reader.onload = async (event) => {
        const code = event.target?.result as string;
        if (code) {
            // 将读取到的 JS 字符串传入 service
            const success = await musicService.importPlugin(code);
            if (success) {
                setInstalledPlugins([...musicService.getPlugins()]);
                showToast('插件安装成功', 'success');
            } else {
                showToast('插件格式错误', 'error');
            }
        }
        setPluginLoading(false);
    };
    reader.readAsText(file);
};
