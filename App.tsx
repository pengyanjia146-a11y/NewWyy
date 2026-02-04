// App.tsx 中的 handleFileChange 方法

const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPluginLoading(true);
    const reader = new FileReader();

    reader.onload = async (event) => {
        const code = event.target?.result as string;
        if (code) {
            // 调用 service 进行安装
            const success = await musicService.importPlugin(code);
            if (success) {
                // 更新 UI 上的插件列表
                setInstalledPlugins([...musicService.getPlugins()]);
                showToast('插件导入成功', 'success');
            } else {
                showToast('插件解析失败，请检查格式', 'error');
            }
        }
        setPluginLoading(false);
    };

    reader.onerror = () => {
        showToast('文件读取失败', 'error');
        setPluginLoading(false);
    };

    reader.readAsText(file); // 以文本格式读取 JS 文件
};
