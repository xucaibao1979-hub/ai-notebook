"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Trash2, Loader2, AlertTriangle, Eye, EyeOff, Languages, User, BookOpen, Bot, Shield, RefreshCw, Plus, Zap, CheckCircle2, XCircle, Download, Upload, BarChart3 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { UserManagement } from "@/components/admin/user-management";
import { ModelTaskPanel } from '@/components/model-task-panel';
import { StudyCatalogPanel } from '@/components/study-catalog-panel';
import { LearnerSwitcher } from '@/components/learner-switcher';
import { CompleteBackupPanel } from '@/components/complete-backup-panel';
import { AccountSettings } from '@/components/admin/account-settings';
import { PROVIDER_PRESETS, ProviderPreset } from '@/lib/ai/provider-presets';
import { GradePicker } from '@/components/grade-picker';
import { apiClient } from "@/lib/api-client";
import { frontendLogger } from "@/lib/frontend-logger";
import { AppConfig, UserProfile, UpdateUserProfileRequest, OpenAIInstance } from "@/types/api";
import { ModelSelector } from "@/components/ui/model-selector";
import { PromptSettings } from "@/components/settings/prompt-settings";

import { MessageSquareText } from "lucide-react";
const MAX_OPENAI_INSTANCES = 20;

// 生成唯一 ID
function generateId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

interface ProfileFormState {
    currentGrade: string;
    examDate: string;
    name: string;
    email: string;
    educationStage: string;
    enrollmentYear: string | number;
    password: string;
}

export function SettingsDialog({ sidebar = false, hideTrigger = false }: { sidebar?: boolean; hideTrigger?: boolean }) {
    const { data: session } = useSession();
    const { t, language, setLanguage } = useLanguage();
    const [open, setOpen] = useState(false);
    const [activeSettingsTab, setActiveSettingsTab] = useState('general');
    useEffect(() => {
        const openSettings = (event: Event) => {
            const tab = (event as CustomEvent<{ tab?: string }>).detail?.tab;
            if (tab && ['general', 'account', 'study', 'ai', 'prompts', 'admin', 'danger'].includes(tab)) setActiveSettingsTab(tab);
            setOpen(true);
        };
        window.addEventListener('open-app-settings', openSettings);
        return () => window.removeEventListener('open-app-settings', openSettings);
    }, []);
    const dialogContentRef = useRef<HTMLDivElement>(null);
    const [clearingPractice, setClearingPractice] = useState(false);
    const [clearingError, setClearingError] = useState(false);
    const [systemResetting, setSystemResetting] = useState(false);
    const [migratingTags, setMigratingTags] = useState(false);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(false);
    const [showApiKey, setShowApiKey] = useState(false);
    const [config, setConfig] = useState<AppConfig>({ aiProvider: 'gemini' });
    const [modelEditorOpen, setModelEditorOpen] = useState(false);
    const [testingModelKey, setTestingModelKey] = useState('');
    const [modelActionError, setModelActionError] = useState('');
    // OpenAI 多实例状态
    const [selectedInstanceId, setSelectedInstanceId] = useState<string | undefined>(undefined);

    // AI 连接测试状态
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{
        success: boolean;
        textSupport: boolean;
        visionSupport: boolean;
        textError?: string;
        visionError?: string;
        modelInfo?: string;
    } | null>(null);

    // Profile State
    const [profile, setProfile] = useState<ProfileFormState>({
        currentGrade: '',
        examDate: '',
        name: "",
        email: "",
        educationStage: "",
        enrollmentYear: "",
        password: ""
    });
    const [confirmPassword, setConfirmPassword] = useState("");
    const [profileLoading, setProfileLoading] = useState(false);
    const [profileSaving, setProfileSaving] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    // Import/Export state
    const [exporting, setExporting] = useState(false);
    const [importing, setImporting] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [selectedFileName, setSelectedFileName] = useState<string>("");

    const router = useRouter();

    useEffect(() => {
        if (open) {
            fetchSettings();
            fetchProfile();
        }
    }, [open]);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const data = await apiClient.get<AppConfig>("/api/settings");
            setConfig(data);
        } catch (error) {
            frontendLogger.error('[SettingsDialog]', 'Failed to fetch settings', { error: error instanceof Error ? error.message : String(error) });
        } finally {
            setLoading(false);
        }
    };

    const fetchProfile = async () => {
        setProfileLoading(true);
        try {
            const data = await apiClient.get<UserProfile>("/api/user");
            setProfile({
                currentGrade: data.currentGrade ? String(data.currentGrade) : '',
                examDate: data.examDate || '',
                name: data.name || "",
                email: data.email || "",
                educationStage: data.educationStage || "",
                enrollmentYear: data.enrollmentYear || "",
                password: ""
            });
        } catch (error) {
            frontendLogger.error('[SettingsDialog]', 'Failed to fetch profile', { error: error instanceof Error ? error.message : String(error) });
        } finally {
            setProfileLoading(false);
        }
    };

    // 验证 OpenAI 实例必填字段
    const validateOpenAIInstances = (): string | null => {
        if (config.aiProvider !== 'openai') return null;
        const instances = config.openai?.instances || [];
        const activeInstances = instances.filter(instance => instance.id === config.openai?.activeInstanceId);
        if (!activeInstances.length) return '请选择一个模型服务实例';
        for (const instance of activeInstances) {
            if (!instance.name?.trim()) {
                return t.settings?.ai?.validationNameRequired || '实例名称不能为空';
            }
            if (!instance.apiKey?.trim()) {
                return t.settings?.ai?.validationApiKeyRequired || 'API Key 不能为空';
            }
            if (!instance.baseUrl?.trim()) {
                return t.settings?.ai?.validationBaseUrlRequired || 'Base URL 不能为空';
            }
            if (!instance.model?.trim()) {
                return t.settings?.ai?.validationModelRequired || '模型名称不能为空';
            }
        }
        return null;
    };

    // 验证 Azure OpenAI 必填字段
    const validateAzureConfig = (): string | null => {
        if (config.aiProvider !== 'azure') return null;
        if (!config.azure?.endpoint?.trim()) {
            return t.settings?.ai?.validationAzureEndpointRequired || 'Azure Endpoint is required';
        }
        if (!config.azure?.deploymentName?.trim()) {
            return t.settings?.ai?.validationAzureDeploymentRequired || 'Deployment Name is required';
        }
        if (!config.azure?.apiKey?.trim()) {
            return t.settings?.ai?.validationApiKeyRequired || 'API Key is required';
        }
        return null;
    };

    const handleSaveSettings = async () => {
        // 验证 OpenAI 实例必填字段
        const openaiValidationError = validateOpenAIInstances();
        if (openaiValidationError) {
            alert(openaiValidationError);
            return;
        }

        // 验证 Azure 必填字段
        const azureValidationError = validateAzureConfig();
        if (azureValidationError) {
            alert(azureValidationError);
            return;
        }

        setSaving(true);
        try {
            await apiClient.post("/api/settings", config);
            setModelEditorOpen(false);
            alert(t.settings?.messages?.saved || "Settings saved");
            // 保存成功后滚动到顶部，方便关闭对话框
            dialogContentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (error) {
            frontendLogger.error('[SettingsDialog]', 'Failed to save settings', { error: error instanceof Error ? error.message : String(error) });
            alert(t.settings?.messages?.saveFailed || "Failed to save");
        } finally {
            setSaving(false);
        }
    };

    const handleSaveProfile = async () => {
        setProfileSaving(true);
        try {
            // 验证密码一致性（如果用户输入了密码）
            if (profile.password && profile.password !== confirmPassword) {
                alert(t.settings?.messages?.passwordMismatch || 'Passwords do not match');
                setProfileSaving(false);
                return;
            }

            const payload: UpdateUserProfileRequest = {
                currentGrade: profile.currentGrade ? Number(profile.currentGrade) : null,
                examDate: profile.examDate || null,
                name: profile.name,
                email: profile.email,
                educationStage: profile.educationStage,
            };

            if (profile.enrollmentYear) {
                payload.enrollmentYear = parseInt(profile.enrollmentYear.toString());
            }

            if (profile.password) {
                payload.password = profile.password;
            }

            await apiClient.patch("/api/user", payload);

            alert(t.settings?.messages?.profileUpdated || "Profile updated");
            setProfile(prev => ({ ...prev, password: "" })); // Clear password field
            setConfirmPassword(""); // Clear confirm password field
            setShowPassword(false);
            setShowConfirmPassword(false);
            window.location.reload(); // Reload to update user name in UI
        } catch (error: any) {
            frontendLogger.error('[SettingsDialog]', 'Failed to update profile', { error: error?.data?.message || error?.message || String(error) });
            const message = error.data?.message || (t.settings?.messages?.updateFailed || "Update failed");
            alert(message);
        } finally {
            setProfileSaving(false);
        }
    };

    const handleClearData = async () => {
        if (!confirm(t.settings?.clearDataConfirm || "Are you sure?")) {
            return;
        }

        setClearingPractice(true);
        try {
            await apiClient.delete("/api/stats/practice/clear");
            alert(t.settings?.clearSuccess || "Success");
            setOpen(false);
            window.location.reload();
        } catch (error) {
            frontendLogger.error('[SettingsDialog]', 'Failed to clear practice data', { error: error instanceof Error ? error.message : String(error) });
            alert(t.settings?.clearError || "Failed");
        } finally {
            setClearingPractice(false);
        }
    };

    const handleClearErrorData = async () => {
        if (!confirm(t.settings?.clearErrorDataConfirm || "Are you sure?")) {
            return;
        }

        setClearingError(true);
        try {
            await apiClient.delete("/api/error-items/clear");
            alert(t.settings?.clearSuccess || "Success");
            setOpen(false);
            window.location.reload();
        } catch (error) {
            frontendLogger.error('[SettingsDialog]', 'Failed to clear error data', { error: error instanceof Error ? error.message : String(error) });
            alert(t.settings?.clearError || "Failed");
        } finally {
            setClearingError(false);
        }
    };

    const handleSystemReset = async () => {
        // Double confirm
        if (!confirm(t.settings?.systemResetConfirm || "WARNING: Deleting ALL data. Undoing is impossible. Are you sure?")) {
            return;
        }

        // Optional triple confirm?
        const userInput = prompt(t.settings?.systemResetPrompt || "Type 'RESET' to confirm system initialization:", "");
        if (userInput !== 'RESET') {
            if (userInput !== null) alert(t.common?.error || "Confirmation failed");
            return;
        }

        setSystemResetting(true);
        try {
            await apiClient.post("/api/admin/system-reset", {});
            alert(t.settings?.clearSuccess || "Success - System Reset Complete");
            setOpen(false);
            window.location.reload();
        } catch (error) {
            frontendLogger.error('[SettingsDialog]', 'System reset failed', { error: error instanceof Error ? error.message : String(error) });
            alert(t.settings?.clearError || "Failed to reset system");
        } finally {
            setSystemResetting(false);
        }
    };

    const handleExportData = async () => {
        setExporting(true);
        try {
            const res = await fetch('/api/export');
            if (!res.ok) {
                throw new Error('Export failed');
            }
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            // Get filename from Content-Disposition header or use default
            const disposition = res.headers.get('Content-Disposition');
            const filenameMatch = disposition?.match(/filename="(.+)"/);
            a.download = filenameMatch ? filenameMatch[1] : 'wrong-notebook-export.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            alert(t.settings?.exportSuccess || "Export successful");
        } catch (error) {
            frontendLogger.error('[SettingsDialog]', 'Export failed', { error: error instanceof Error ? error.message : String(error) });
            alert(t.settings?.exportFailed || "Export failed");
        } finally {
            setExporting(false);
        }
    };

    const handleExportAllData = async () => {
        if (!confirm(t.settings?.exportAllConfirm || "Export all users' data? This may take a while.")) {
            return;
        }
        setExporting(true);
        try {
            const res = await fetch('/api/export?all=true');
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.message || 'Export failed');
            }
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const disposition = res.headers.get('Content-Disposition');
            const filenameMatch = disposition?.match(/filename="(.+)"/);
            a.download = filenameMatch ? filenameMatch[1] : 'wrong-notebook-export-all.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            alert(t.settings?.exportSuccess || "Export successful");
        } catch (error) {
            frontendLogger.error('[SettingsDialog]', 'Export all failed', { error: error instanceof Error ? error.message : String(error) });
            alert(t.settings?.exportFailed || "Export failed");
        } finally {
            setExporting(false);
        }
    };

    const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
            setSelectedFileName(file.name);
        }
    };

    const handleImportData = async () => {
        if (!selectedFile) return;

        if (!confirm(t.settings?.importConfirm || "Are you sure you want to import?")) {
            return;
        }

        setImporting(true);
        try {
            const text = await selectedFile.text();
            const data = JSON.parse(text);

            const response = await apiClient.post('/api/import', data);
            const stats = (response as any).stats;

            alert(
                (t.settings?.importResultDesc || "Imported {subjects} notebooks, {tags} tags, {items} error items, {schedules} review schedules, {records} practice records.")
                    .replace('{subjects}', String(stats.subjectsCreated))
                    .replace('{tags}', String(stats.tagsCreated))
                    .replace('{items}', String(stats.errorItemsCreated))
                    .replace('{schedules}', String(stats.reviewSchedulesCreated))
                    .replace('{records}', String(stats.practiceRecordsCreated))
            );

            setSelectedFile(null);
            setSelectedFileName("");
            window.location.reload();
        } catch (error) {
            frontendLogger.error('[SettingsDialog]', 'Import failed', { error: error instanceof Error ? error.message : String(error) });
            alert(t.settings?.importFailed || "Import failed");
        } finally {
            setImporting(false);
        }
    };

    const handleImportAllData = async () => {
        if (!selectedFile) return;

        if (!confirm(t.settings?.importAllConfirm || "Import all users' data? This will restore data for all users from the export file.")) {
            return;
        }

        setImporting(true);
        try {
            const text = await selectedFile.text();
            const data = JSON.parse(text);
            const res = await fetch("/api/import?all=true", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            const result = await res.json();
            if (result.success) {
                const s = result.stats;
                alert(
                    (t.settings?.importResultDesc || "Imported {subjects} notebooks, {tags} tags, {items} error items, {schedules} review schedules, {records} practice records.")
                        .replace('{subjects}', String(s.subjectsCreated))
                        .replace('{tags}', String(s.tagsCreated))
                        .replace('{items}', String(s.errorItemsCreated))
                        .replace('{schedules}', String(s.reviewSchedulesCreated))
                        .replace('{records}', String(s.practiceRecordsCreated))
                );
                setSelectedFile(null);
                setSelectedFileName("");
                window.location.reload();
            } else {
                throw new Error(result.message || "Import failed");
            }
        } catch (error) {
            frontendLogger.error('[SettingsDialog]', 'Import all failed', { error: error instanceof Error ? error.message : String(error) });
            alert(t.settings?.importFailed || "Import failed");
        } finally {
            setImporting(false);
        }
    };

    const handleMigrateTags = async () => {
        if (!confirm(t.settings?.migrateTagsConfirm || "This will reset system tags. Confirm?")) {
            return;
        }

        setMigratingTags(true);
        try {
            const res = await apiClient.post("/api/admin/migrate-tags", {});
            alert(`${t.settings?.clearSuccess || "Success"}: ${(res as any).count || 0} tags migrated.`);
            // No reload needed necessarily, but good to refresh if user is viewing tags.
        } catch (error) {
            frontendLogger.error('[SettingsDialog]', 'Tag migration failed', { error: error instanceof Error ? error.message : String(error) });
            alert(t.settings?.clearError || "Failed to migrate tags");
        } finally {
            setMigratingTags(false);
        }
    };

    const updateConfig = (section: 'openai' | 'gemini', key: string, value: string) => {
        if (section === 'gemini') {
            setConfig(prev => ({
                ...prev,
                gemini: {
                    ...prev.gemini,
                    [key]: value
                }
            }));
        }
        // OpenAI 配置更新通过 updateOpenAIInstance 处理
    };

    // 获取当前选中的 OpenAI 实例
    const getSelectedInstance = (): OpenAIInstance | undefined => {
        const instances = config.openai?.instances || [];
        const activeId = selectedInstanceId || config.openai?.activeInstanceId;
        return instances.find(i => i.id === activeId);
    };

    // 更新当前选中的 OpenAI 实例属性
    const updateOpenAIInstance = <K extends keyof OpenAIInstance>(key: K, value: OpenAIInstance[K]) => {
        const instances = config.openai?.instances || [];
        const activeId = selectedInstanceId || config.openai?.activeInstanceId;
        const updatedInstances = instances.map(instance =>
            instance.id === activeId ? { ...instance, [key]: value } : instance
        );
        setConfig(prev => ({
            ...prev,
            openai: {
                ...prev.openai,
                instances: updatedInstances,
            }
        }));
    };

    const selectProviderPreset = (preset: ProviderPreset) => {
        const instances = config.openai?.instances || [];
        const existing = instances.find(instance => instance.providerId === preset.id);
        if (!existing && instances.length >= MAX_OPENAI_INSTANCES) {
            alert('已达到服务实例上限，请先删除不用的实例。');
            return;
        }
        const instance = existing || { id: generateId(), name: preset.name, apiKey: '', baseUrl: preset.baseUrl, model: preset.model, providerId: preset.id, apiMode: preset.apiMode };
        setConfig(previous => ({ ...previous, aiProvider: 'openai', openai: { instances: existing ? instances : [...instances, instance], activeInstanceId: instance.id } }));
        setSelectedInstanceId(instance.id);
        setTestResult(null);
    };

    // 添加新的 OpenAI 实例
    const addOpenAIInstance = () => {
        const instances = config.openai?.instances || [];
        if (instances.length >= MAX_OPENAI_INSTANCES) return;

        const newInstance: OpenAIInstance = {
            id: generateId(),
            name: `Instance ${instances.length + 1}`,
            apiKey: '',
            baseUrl: 'https://api.openai.com/v1',
            model: 'gpt-4o',
        };

        setConfig(prev => ({
            ...prev,
            openai: {
                instances: [...(prev.openai?.instances || []), newInstance],
                activeInstanceId: newInstance.id,
            }
        }));
        setSelectedInstanceId(newInstance.id);
    };

    // 删除 OpenAI 实例
    const deleteOpenAIInstance = (instanceId: string) => {
        const instances = config.openai?.instances || [];
        const updatedInstances = instances.filter(i => i.id !== instanceId);
        const newActiveId = updatedInstances.length > 0 ? updatedInstances[0].id : undefined;

        setConfig(prev => ({
            ...prev,
            openai: {
                instances: updatedInstances,
                activeInstanceId: newActiveId,
            }
        }));
        setSelectedInstanceId(newActiveId);
    };

    const removeSavedModel = async (provider: 'openai' | 'gemini' | 'azure', instanceId?: string) => {
        if (!window.confirm('确定删除这个模型服务？删除后使用它的任务需要重新选择模型。')) return;
        setSaving(true);
        setModelActionError('');
        try {
            const current = await apiClient.get<AppConfig>('/api/settings');
            const remaining = (current.openai?.instances || []).filter(instance => instance.id !== instanceId);
            const nextOpenAI = remaining.find(instance => instance.apiKey?.trim())?.id || '';
            const nextProvider = (excluded: 'openai' | 'gemini' | 'azure'): AppConfig['aiProvider'] => {
                if (excluded !== 'openai' && nextOpenAI) return 'openai';
                if (excluded !== 'gemini' && current.gemini?.apiKey) return 'gemini';
                if (excluded !== 'azure' && current.azure?.apiKey) return 'azure';
                return 'openai';
            };
            const changes: Partial<AppConfig> = provider === 'openai'
                ? {
                    openai: { instances: remaining, activeInstanceId: current.openai?.activeInstanceId === instanceId ? nextOpenAI : current.openai?.activeInstanceId },
                    taskModels: Object.fromEntries(Object.entries(current.taskModels || {}).filter(([, id]) => id !== instanceId)),
                    backupInstanceId: current.backupInstanceId === instanceId ? '' : current.backupInstanceId,
                    aiProvider: current.aiProvider === 'openai' && !nextOpenAI ? nextProvider('openai') : current.aiProvider,
                }
                : provider === 'gemini'
                    ? { gemini: { ...current.gemini, apiKey: '' }, aiProvider: current.aiProvider === 'gemini' ? nextProvider('gemini') : current.aiProvider }
                    : { azure: { ...current.azure, apiKey: '' }, aiProvider: current.aiProvider === 'azure' ? nextProvider('azure') : current.aiProvider };
            const updated = await apiClient.post<AppConfig>('/api/settings', changes);
            setConfig(updated);
            if (selectedInstanceId === instanceId) setSelectedInstanceId(nextOpenAI || undefined);
            setModelEditorOpen(false);
            setTestResult(null);
        } catch (error) {
            setModelActionError(error instanceof Error ? error.message : '删除模型失败，请重试。');
        } finally {
            setSaving(false);
        }
    };

    // 切换激活的 OpenAI 实例
    const setActiveOpenAIInstance = (instanceId: string) => {
        setSelectedInstanceId(instanceId);
        setConfig(prev => ({
            ...prev,
            openai: {
                ...prev.openai,
                activeInstanceId: instanceId,
            }
        }));
    };

    // 同步 selectedInstanceId 与 config
    useEffect(() => {
        if (config.openai?.activeInstanceId && !selectedInstanceId) {
            setSelectedInstanceId(config.openai.activeInstanceId);
        }
    }, [config.openai?.activeInstanceId, selectedInstanceId]);

    const updatePrompts = (type: 'analyze' | 'similar', value: string) => {
        setConfig(prev => ({
            ...prev,
            prompts: {
                ...prev.prompts,
                [type]: value
            }
        }));
    };

    // 测试 AI 连接
    const handleTestConnection = async (target?: { provider: 'openai' | 'gemini' | 'azure'; instance?: OpenAIInstance; key: string }) => {
        setTestingModelKey(target?.key || 'editor');
        setTesting(true);
        setTestResult(null);
        try {
            let requestBody: Record<string, unknown>;
            const provider = target?.provider || config.aiProvider;
            if (provider === 'openai') {
                const instance = target?.instance || getSelectedInstance();
                  if (!instance?.apiKey) {
                    setTestResult({ success: false, textSupport: false, visionSupport: false, textError: t.settings?.ai?.validationApiKeyRequired || 'API Key is required' });
                    setTesting(false);
                      return;
                  }
                  if (!instance.baseUrl?.trim() || !instance.model?.trim()) {
                      setTestResult({ success: false, textSupport: false, visionSupport: false, textError: '请填写服务地址和已开通的模型 ID，再测试连接' });
                      setTesting(false);
                      return;
                  }
                requestBody = {
                    provider: 'openai',
                    apiKey: instance.apiKey,
                      baseUrl: instance.baseUrl,
                      model: instance.model,
                      apiMode: instance.apiMode || 'chat',
                    language: language
                };
            } else if (provider === 'gemini') {
                if (!config.gemini?.apiKey) {
                    setTestResult({ success: false, textSupport: false, visionSupport: false, textError: t.settings?.ai?.validationApiKeyRequired || 'API Key is required' });
                    setTesting(false);
                    return;
                }
                requestBody = {
                    provider: 'gemini',
                    apiKey: config.gemini.apiKey,
                    baseUrl: config.gemini.baseUrl,
                    model: config.gemini.model,
                    language: language
                };
            } else if (provider === 'azure') {
                if (!config.azure?.apiKey || !config.azure?.endpoint || !config.azure?.deploymentName) {
                    setTestResult({ success: false, textSupport: false, visionSupport: false, textError: t.settings?.ai?.validationAzureEndpointRequired || 'Azure config is incomplete' });
                    setTesting(false);
                    return;
                }
                requestBody = {
                    provider: 'azure',
                    apiKey: config.azure.apiKey,
                    endpoint: config.azure.endpoint,
                    deploymentName: config.azure.deploymentName,
                    apiVersion: config.azure.apiVersion,
                    model: config.azure.model,
                    language: language
                };
            } else {
                setTesting(false);
                return;
            }

            const response = await apiClient.post<{
                success: boolean;
                textSupport: boolean;
                visionSupport: boolean;
                textError?: string;
                visionError?: string;
                modelInfo?: string;
            }>('/api/ai/test', requestBody);

            setTestResult(response);
        } catch (error) {
            frontendLogger.error('[SettingsDialog]', 'AI connection test failed', { error: error instanceof Error ? error.message : String(error) });
            setTestResult({
                success: false,
                textSupport: false,
                visionSupport: false,
                textError: error instanceof Error ? error.message : String(error)
            });
        } finally {
            setTesting(false);
        }
    };


    return (
        <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setModelEditorOpen(false); }}>
            {!hideTrigger && <DialogTrigger asChild>
                <Button variant="ghost" size={sidebar ? 'default' : 'icon'} className={sidebar ? 'w-full justify-start gap-3 h-12 px-4 font-normal text-slate-500 hover:bg-indigo-50 hover:text-indigo-600' : 'rounded-full'}>
                    <Settings className="h-5 w-5 shrink-0" />
                    <span className={sidebar ? '' : 'sr-only'}>{t.settings?.title || "设置"}</span>
                </Button>
            </DialogTrigger>}
            <DialogContent ref={dialogContentRef} className="w-[calc(100vw-2rem)] sm:max-w-[1100px] h-[min(85vh,850px)] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle>{t.settings?.title || "Settings"}</DialogTitle>
                    <DialogDescription>
                        {t.settings?.desc || 'Manage your preferences and data.'}
                    </DialogDescription>
                </DialogHeader>

                <Tabs value={activeSettingsTab} onValueChange={setActiveSettingsTab} className="flex min-h-0 w-full flex-1 flex-col gap-4 sm:flex-row">
                    <TabsList className="flex h-auto w-full shrink-0 flex-row flex-wrap items-start justify-start gap-1 overflow-y-auto rounded-lg bg-slate-50 p-2 sm:w-52 sm:flex-col sm:flex-nowrap">
                        <TabsTrigger value="general" className="justify-start gap-2 px-2 sm:w-full sm:px-3">
                            <Languages className="h-4 w-4" />
                            <span className="">{t.settings?.tabs?.general || "General"}</span>
                        </TabsTrigger>
                        <TabsTrigger value="account" className="justify-start gap-2 px-2 sm:w-full sm:px-3">
                            <User className="h-4 w-4" />
                            <span className="">{t.settings?.tabs?.account || "Account"}</span>
                        </TabsTrigger>
                        <TabsTrigger value="study" className="justify-start gap-2 px-2 sm:w-full sm:px-3">
                            <BookOpen className="h-4 w-4" />
                            <span className="">科目设置</span>
                        </TabsTrigger>
                        {(session?.user as any)?.role === 'admin' && (
                            <>
                                <TabsTrigger value="ai" className="justify-start gap-2 px-2 sm:w-full sm:px-3">
                                    <Bot className="h-4 w-4" />
                                    <span className="">{t.settings?.tabs?.ai || "AI Provider"}</span>
                                </TabsTrigger>
                                <TabsTrigger value="prompts" className="justify-start gap-2 px-2 sm:w-full sm:px-3">
                                    <MessageSquareText className="h-4 w-4" />
                                    <span className="">{t.settings?.tabs?.prompts || "Prompts"}</span>
                                </TabsTrigger>
                                <TabsTrigger value="admin" className="justify-start gap-2 px-2 sm:w-full sm:px-3">
                                    <Shield className="h-4 w-4" />
                                    <span className="">{t.settings?.tabs?.admin || "User Management"}</span>
                                </TabsTrigger>
                            </>
                        )}
                        <TabsTrigger value="danger" className="justify-start gap-2 px-2 sm:w-full sm:px-3">
                            <AlertTriangle className="h-4 w-4" />
                            <span className="">{t.settings?.tabs?.danger || "Danger"}</span>
                        </TabsTrigger>

                    </TabsList>

                    <div className="min-w-0 flex-1 overflow-y-auto pr-1">
                    {/* General Tab */}
                    <TabsContent value="general" className="space-y-4 py-4">
                        <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
                            <div className="space-y-2">
                                <Label>{t.settings?.language || "Language"}</Label>
                                <Select
                                    value={language}
                                    onValueChange={(val: 'zh' | 'en') => setLanguage(val)}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="zh">中文 (Chinese)</SelectItem>
                                        <SelectItem value="en">English</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2 pt-4 border-t">
                                <Label>{t.settings?.general?.timeoutLabel || "AI Analysis Timeout (Seconds)"}</Label>
                                <Input
                                    type="number"
                                    value={config.timeouts?.analyze ? config.timeouts.analyze / 1000 : ''}
                                    onChange={(e) => {
                                        const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                                        // Allow typing, validate later
                                        setConfig(prev => ({
                                            ...prev,
                                            timeouts: {
                                                ...prev.timeouts,
                                                analyze: isNaN(val) ? 0 : val * 1000
                                            }
                                        }));
                                    }}
                                    onBlur={() => {
                                        const currentVal = (config.timeouts?.analyze || 0) / 1000;
                                        // Valid range 120-600, default 120
                                        let safeVal = currentVal;
                                        if (safeVal < 120) safeVal = 120;
                                        if (safeVal > 600) safeVal = 600;

                                        if (safeVal !== currentVal) {
                                            setConfig(prev => ({
                                                ...prev,
                                                timeouts: {
                                                    ...prev.timeouts,
                                                    analyze: safeVal * 1000
                                                }
                                            }));
                                        }
                                    }}
                                    min={120}
                                    max={600}
                                />
                                <p className="text-xs text-muted-foreground">
                                    {t.settings?.general?.timeoutDesc || "Increase this value if you experience frequent timeouts during AI analysis."}
                                </p>
                            </div>
                        </div>
                        <Button onClick={handleSaveSettings} disabled={saving} className="w-full">
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {t.settings?.save || "Save Settings"}
                        </Button>
                    </TabsContent>

                    {/* Account Tab */}
                    <TabsContent value="account" className="space-y-4 py-4">
                        <section className="rounded-lg border p-4"><h3 className="mb-3 font-semibold">家庭学习身份</h3><LearnerSwitcher mode="manage" /></section>
                        {profileLoading ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2"><Label htmlFor="profile-current-grade">当前年级</Label><GradePicker value={profile.currentGrade} onChange={grade => setProfile({ ...profile, currentGrade: grade })} /><p className="text-xs text-muted-foreground">明确选择的当前年级优先用于倒计时和作业推荐；升年级后请更新。</p></div>
                                    <div className="space-y-2"><Label htmlFor="profile-exam-date">中考 / 高考日期</Label><Input id="profile-exam-date" type="date" value={profile.examDate} onChange={e => setProfile({ ...profile, examDate: e.target.value })} /><p className="text-xs text-muted-foreground">中考请填写当地考试日期；高考未填写时使用预计 6 月 7 日，正式安排公布后可修改。</p></div>
                                    <div className="space-y-2">
                                        <Label>{t.auth?.name || "Name"}</Label>
                                        <Input
                                            value={profile.name || ""}
                                            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>{t.auth?.email || "Email"}</Label>
                                        <Input
                                            value={profile.email || ""}
                                            onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                                            type="email"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>{t.auth?.educationStage || "Education Stage"}</Label>
                                        <Select
                                            value={profile.educationStage || ""}
                                            onValueChange={(val) => setProfile({ ...profile, educationStage: val })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder={t.auth?.selectStage || "Select Stage"} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="primary">{t.auth?.primary || 'Primary School'}</SelectItem>
                                                <SelectItem value="junior_high">{t.auth?.juniorHigh || 'Junior High'}</SelectItem>
                                                <SelectItem value="senior_high">{t.auth?.seniorHigh || 'Senior High'}</SelectItem>
                                                <SelectItem value="university">{t.auth?.university || 'University'}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>{t.auth?.enrollmentYear || "Enrollment Year"}</Label>
                                        <Input
                                            type="number"
                                            value={profile.enrollmentYear || ""}
                                            onChange={(e) => setProfile({ ...profile, enrollmentYear: e.target.value })}
                                            placeholder="YYYY"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-3 pt-2 border-t">
                                    <div className="space-y-2">
                                        <Label>{t.settings?.account?.changePassword || "Change Password (Leave empty to keep)"}</Label>
                                        <div className="relative">
                                            <Input
                                                type={showPassword ? "text" : "password"}
                                                value={profile.password}
                                                onChange={(e) => setProfile({ ...profile, password: e.target.value })}
                                                placeholder="******"
                                                minLength={6}
                                                className="pr-10"
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                                onClick={() => setShowPassword(!showPassword)}
                                                tabIndex={-1}
                                            >
                                                {showPassword ? (
                                                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                                                ) : (
                                                    <Eye className="h-4 w-4 text-muted-foreground" />
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                    {profile.password && (
                                        <div className="space-y-2">
                                            <Label>{t.auth?.confirmPassword || "Confirm Password"}</Label>
                                            <div className="relative">
                                                <Input
                                                    type={showConfirmPassword ? "text" : "password"}
                                                    value={confirmPassword}
                                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                                    placeholder="******"
                                                    minLength={6}
                                                    className="pr-10"
                                                />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                                    tabIndex={-1}
                                                >
                                                    {showConfirmPassword ? (
                                                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                                                    ) : (
                                                        <Eye className="h-4 w-4 text-muted-foreground" />
                                                    )}
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <Button onClick={handleSaveProfile} disabled={profileSaving} className="w-full">
                                    {profileSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    {t.settings?.account?.update || "Update Profile"}
                                </Button>
                            </div>
                        )}
                        <CompleteBackupPanel />
                    </TabsContent>

                    <TabsContent value="study" className="space-y-4 py-4">
                        <StudyCatalogPanel />
                    </TabsContent>

                    {/* AI Tab */}
                    <TabsContent value="ai" className="space-y-4 py-4">
                        <div className="mx-auto w-full max-w-3xl pt-3">
                            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                                <div className="flex items-start justify-between gap-4"><h3 className="text-base font-semibold text-slate-900">自定义模型</h3><Button type="button" variant="outline" size="sm" onClick={() => { addOpenAIInstance(); setConfig(prev => ({ ...prev, aiProvider: 'openai' })); setModelEditorOpen(true); setTestResult(null); }}>添加模型</Button></div>
                                <div className="mt-4 divide-y border-t border-slate-200 empty:hidden">
                                    {(config.openai?.instances || []).filter(instance => instance.name?.trim() && instance.model?.trim() && instance.apiKey?.trim()).map(instance => <div key={instance.id} className="flex flex-wrap items-center gap-3 py-4 text-sm"><Bot className="size-5 shrink-0 text-indigo-500" /><div className="min-w-0 flex-1"><span className="font-semibold text-slate-800">{instance.name}</span><span className="ml-2 text-xs text-slate-500">{config.aiProvider === 'openai' && config.openai?.activeInstanceId === instance.id ? '当前使用 · ' : ''}{instance.model} · {instance.providerId || 'OpenAI 兼容'}</span></div><div className="flex items-center gap-1"><Button type="button" variant="ghost" size="sm" disabled={testing} onClick={() => handleTestConnection({ provider: 'openai', instance, key: instance.id })}>{testing && testingModelKey === instance.id ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Zap className="mr-1 size-3.5" />}测试</Button><Button type="button" variant="ghost" size="sm" onClick={() => { setConfig(prev => ({ ...prev, aiProvider: 'openai' })); setSelectedInstanceId(instance.id); setModelEditorOpen(true); setTestResult(null); }}>编辑</Button><Button type="button" variant="ghost" size="sm" className="text-red-500 hover:text-red-600" disabled={saving} onClick={() => removeSavedModel('openai', instance.id)} aria-label="删除模型"><Trash2 className="size-3.5" /></Button></div></div>)}
                                    {config.gemini?.apiKey && <div className="flex flex-wrap items-center gap-3 py-4 text-sm"><Bot className="size-5 shrink-0 text-indigo-500" /><div className="min-w-0 flex-1"><span className="font-semibold text-slate-800">{config.gemini.model || 'Google Gemini'}</span><span className="ml-2 text-xs text-slate-500">{config.aiProvider === 'gemini' ? '当前使用 · ' : ''}Google Gemini</span></div><div className="flex items-center gap-1"><Button type="button" variant="ghost" size="sm" disabled={testing} onClick={() => handleTestConnection({ provider: 'gemini', key: 'gemini' })}>{testing && testingModelKey === 'gemini' ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Zap className="mr-1 size-3.5" />}测试</Button><Button type="button" variant="ghost" size="sm" onClick={() => { setConfig(prev => ({ ...prev, aiProvider: 'gemini' })); setModelEditorOpen(true); setTestResult(null); }}>编辑</Button><Button type="button" variant="ghost" size="sm" className="text-red-500 hover:text-red-600" disabled={saving} onClick={() => removeSavedModel('gemini')} aria-label="删除模型"><Trash2 className="size-3.5" /></Button></div></div>}
                                    {config.azure?.apiKey && <div className="flex flex-wrap items-center gap-3 py-4 text-sm"><Bot className="size-5 shrink-0 text-indigo-500" /><div className="min-w-0 flex-1"><span className="font-semibold text-slate-800">{config.azure.model || config.azure.deploymentName || 'Azure OpenAI'}</span><span className="ml-2 text-xs text-slate-500">{config.aiProvider === 'azure' ? '当前使用 · ' : ''}Azure OpenAI</span></div><div className="flex items-center gap-1"><Button type="button" variant="ghost" size="sm" disabled={testing} onClick={() => handleTestConnection({ provider: 'azure', key: 'azure' })}>{testing && testingModelKey === 'azure' ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Zap className="mr-1 size-3.5" />}测试</Button><Button type="button" variant="ghost" size="sm" onClick={() => { setConfig(prev => ({ ...prev, aiProvider: 'azure' })); setModelEditorOpen(true); setTestResult(null); }}>编辑</Button><Button type="button" variant="ghost" size="sm" className="text-red-500 hover:text-red-600" disabled={saving} onClick={() => removeSavedModel('azure')} aria-label="删除模型"><Trash2 className="size-3.5" /></Button></div></div>}
                                </div>
                                {modelActionError && <p role="alert" className="mt-2 text-xs text-red-600">{modelActionError}</p>}
                                {testResult && !modelEditorOpen && <p role="status" className={`mt-1 text-xs ${testResult.success ? 'text-emerald-700' : 'text-red-600'}`}>{testResult.success ? '连接测试成功' : `连接测试失败：${testResult.textError || '请检查模型配置'}`}</p>}
                            </div>
                        </div>
                        {modelEditorOpen && <>
                        <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">模型服务配置</h3><Button type="button" variant="ghost" size="sm" onClick={() => setModelEditorOpen(false)}>收起配置</Button></div>
                        <p className="text-xs text-slate-500">自定义拍照模型：点击下方“添加”创建模型实例，在“模型名称”输入框填入服务商提供的图片识别模型 ID，测试并保存后，在上方“拍照批改专用模型”中选用。</p>
                        <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
                            <details><summary className="cursor-pointer text-sm font-semibold text-slate-700">展开选择模型服务</summary>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{PROVIDER_PRESETS.map(preset => <button key={preset.id} type="button" onClick={() => selectProviderPreset(preset)} aria-pressed={config.aiProvider === 'openai' && getSelectedInstance()?.providerId === preset.id} className={`rounded-lg border px-3 py-2.5 text-left text-xs transition-colors ${config.aiProvider === 'openai' && getSelectedInstance()?.providerId === preset.id ? 'border-indigo-400 bg-white font-semibold text-indigo-600' : 'border-slate-200 bg-white text-slate-500 hover:border-indigo-300'}`}>{preset.name}</button>)}</div>
                            <p className="mt-3 text-xs leading-6 text-slate-400">选择服务商会自动填入接口预设，保留已配置的其他实例。填写自己的 API 密钥与已开通的模型，测试通过后保存并启用。Google Gemini 与 Azure OpenAI 仍可在下方选择。</p>
                            {config.aiProvider === 'openai' && (() => { const preset = PROVIDER_PRESETS.find(preset => preset.id === getSelectedInstance()?.providerId); return preset ? <p className="mt-2 text-xs leading-6 text-slate-500">{preset.note} <a href={preset.docs} target="_blank" rel="noreferrer" className="text-indigo-500 underline">官方接入文档</a></p> : null; })()}
                            </details>
                        </div>
                        {loading ? (
                            <div className="flex justify-center py-4">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
                                <div className="space-y-2">
                                    <Label>{t.settings?.tabs?.ai || "AI Provider"}</Label>
                                    <Select
                                        value={config.aiProvider}
                                        onValueChange={(val: 'gemini' | 'openai' | 'azure') => setConfig(prev => ({ ...prev, aiProvider: val }))}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="gemini">Google Gemini</SelectItem>
                                            <SelectItem value="openai">OpenAI / Compatible</SelectItem>
                                            <SelectItem value="azure">Azure OpenAI</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {config.aiProvider === 'openai' && (
                                    <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                                        {getSelectedInstance() && <div className="space-y-2"><Label>接口协议</Label><Select value={getSelectedInstance()?.apiMode || 'chat'} onValueChange={(value: 'chat' | 'responses') => updateOpenAIInstance('apiMode', value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="chat">Chat Completions · 常见兼容接口</SelectItem><SelectItem value="responses">Responses · OpenAI / Codex</SelectItem></SelectContent></Select><p className="text-xs text-muted-foreground">Codex 模型需要 Responses。其他厂商是否支持该协议，以官方文档为准。</p></div>}
                                        {/* 实例选择器 */}
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <Label>{t.settings?.ai?.instances || "Instance"}</Label>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={addOpenAIInstance}
                                                    disabled={(config.openai?.instances?.length || 0) >= MAX_OPENAI_INSTANCES}
                                                    className="h-7 px-2 text-xs"
                                                >
                                                    <Plus className="h-3 w-3 mr-1" />
                                                    {t.settings?.ai?.addInstance || "Add"}
                                                </Button>
                                            </div>
                                            {(config.openai?.instances?.length || 0) > 0 ? (
                                                <div className="flex gap-2">
                                                    <Select
                                                        value={selectedInstanceId || config.openai?.activeInstanceId || ''}
                                                        onValueChange={setActiveOpenAIInstance}
                                                    >
                                                        <SelectTrigger className="flex-1">
                                                            <SelectValue placeholder={t.settings?.ai?.selectInstance || "Select Instance"} />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {(config.openai?.instances || []).map((instance) => (
                                                                <SelectItem key={instance.id} value={instance.id}>
                                                                    {instance.name}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    {(config.openai?.instances?.length || 0) > 1 && (
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="icon"
                                                            onClick={() => {
                                                                const activeId = selectedInstanceId || config.openai?.activeInstanceId;
                                                                if (activeId && confirm(t.settings?.ai?.confirmDelete || 'Delete this instance?')) {
                                                                    deleteOpenAIInstance(activeId);
                                                                }
                                                            }}
                                                            className="h-10 w-10 text-destructive hover:text-destructive"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                </div>
                                            ) : (
                                                <p className="text-sm text-muted-foreground">
                                                    {t.settings?.ai?.noInstances || "No instances configured. Click 'Add' to create one."}
                                                </p>
                                            )}
                                            {(config.openai?.instances?.length || 0) >= MAX_OPENAI_INSTANCES && (
                                                <p className="text-xs text-amber-600">
                                                    {t.settings?.ai?.maxInstancesReached || "Maximum instances reached (10)"}
                                                </p>
                                            )}
                                        </div>

                                        {/* 实例配置表单 */}
                                        {getSelectedInstance() && (
                                            <div className="space-y-3 p-3 border rounded-md bg-background">
                                                <div className="space-y-2">
                                                    <Label>{t.settings?.ai?.instanceName || "Instance Name"} <span className="text-destructive">*</span></Label>
                                                    <Input
                                                        value={getSelectedInstance()?.name || ''}
                                                        onChange={(e) => updateOpenAIInstance('name', e.target.value)}
                                                        placeholder="e.g. 智谱 GLM-4V"
                                                        className={!getSelectedInstance()?.name?.trim() ? 'border-destructive' : ''}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>API Key <span className="text-destructive">*</span></Label>
                                                    <div className="relative">
                                                        <Input
                                                            type={showApiKey ? "text" : "password"}
                                                            value={getSelectedInstance()?.apiKey || ''}
                                                            onChange={(e) => updateOpenAIInstance('apiKey', e.target.value)}
                                                            placeholder="sk-..."
                                                            className={`pr-10 ${!getSelectedInstance()?.apiKey?.trim() ? 'border-destructive' : ''}`}
                                                        />
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                                            onClick={() => setShowApiKey(!showApiKey)}
                                                        >
                                                            {showApiKey ? (
                                                                <EyeOff className="h-4 w-4 text-muted-foreground" />
                                                            ) : (
                                                                <Eye className="h-4 w-4 text-muted-foreground" />
                                                            )}
                                                        </Button>
                                                    </div>
                                                </div>
                                                <div className="space-y-2 pt-4 border-t">
                                                    <Label>Base URL <span className="text-destructive">*</span></Label>
                                                    <Input
                                                        value={getSelectedInstance()?.baseUrl || ''}
                                                        onChange={(e) => updateOpenAIInstance('baseUrl', e.target.value)}
                                                        placeholder="https://api.openai.com/v1"
                                                        className={!getSelectedInstance()?.baseUrl?.trim() ? 'border-destructive' : ''}
                                                    />
                                                </div>
                                                <ModelSelector
                                                    provider="openai"
                                                    apiKey={getSelectedInstance()?.apiKey}
                                                    baseUrl={getSelectedInstance()?.baseUrl}
                                                    currentModel={getSelectedInstance()?.model}
                                                    onModelChange={(model) => updateOpenAIInstance('model', model)}
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {config.aiProvider === 'gemini' && (
                                    <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                                        <div className="space-y-2">
                                            <Label>API Key</Label>
                                            <div className="relative">
                                                <Input
                                                    type={showApiKey ? "text" : "password"}
                                                    value={config.gemini?.apiKey || ''}
                                                    onChange={(e) => updateConfig('gemini', 'apiKey', e.target.value)}
                                                    placeholder="AIza..."
                                                    className="pr-10"
                                                />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                                    onClick={() => setShowApiKey(!showApiKey)}
                                                >
                                                    {showApiKey ? (
                                                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                                                    ) : (
                                                        <Eye className="h-4 w-4 text-muted-foreground" />
                                                    )}
                                                </Button>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Base URL (Optional)</Label>
                                            <Input
                                                value={config.gemini?.baseUrl || ''}
                                                onChange={(e) => updateConfig('gemini', 'baseUrl', e.target.value)}
                                                placeholder="https://generativelanguage.googleapis.com"
                                            />
                                        </div>
                                        <ModelSelector
                                            provider="gemini"
                                            apiKey={config.gemini?.apiKey}
                                            baseUrl={config.gemini?.baseUrl}
                                            currentModel={config.gemini?.model}
                                            onModelChange={(model) => updateConfig('gemini', 'model', model)}
                                        />
                                    </div>
                                )}

                                {config.aiProvider === 'azure' && (
                                    <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                                        <div className="space-y-2">
                                            <Label>{t.settings?.ai?.azureEndpoint || "Azure Endpoint"} <span className="text-destructive">*</span></Label>
                                            <Input
                                                value={config.azure?.endpoint || ''}
                                                onChange={(e) => setConfig(prev => ({ ...prev, azure: { ...prev.azure, endpoint: e.target.value } }))}
                                                placeholder={t.settings?.ai?.azureEndpointPlaceholder || "https://your-resource.openai.azure.com"}
                                                className={!config.azure?.endpoint?.trim() ? 'border-destructive' : ''}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>{t.settings?.ai?.azureDeployment || "Deployment Name"} <span className="text-destructive">*</span></Label>
                                            <Input
                                                value={config.azure?.deploymentName || ''}
                                                onChange={(e) => setConfig(prev => ({ ...prev, azure: { ...prev.azure, deploymentName: e.target.value } }))}
                                                placeholder={t.settings?.ai?.azureDeploymentPlaceholder || "gpt-4o-deployment"}
                                                className={!config.azure?.deploymentName?.trim() ? 'border-destructive' : ''}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>API Key <span className="text-destructive">*</span></Label>
                                            <div className="relative">
                                                <Input
                                                    type={showApiKey ? "text" : "password"}
                                                    value={config.azure?.apiKey || ''}
                                                    onChange={(e) => setConfig(prev => ({ ...prev, azure: { ...prev.azure, apiKey: e.target.value } }))}
                                                    placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                                                    className={`pr-10 ${!config.azure?.apiKey?.trim() ? 'border-destructive' : ''}`}
                                                />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                                    onClick={() => setShowApiKey(!showApiKey)}
                                                >
                                                    {showApiKey ? (
                                                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                                                    ) : (
                                                        <Eye className="h-4 w-4 text-muted-foreground" />
                                                    )}
                                                </Button>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>{t.settings?.ai?.azureApiVersion || "API Version"}</Label>
                                            <Input
                                                value={config.azure?.apiVersion || ''}
                                                onChange={(e) => setConfig(prev => ({ ...prev, azure: { ...prev.azure, apiVersion: e.target.value } }))}
                                                placeholder={t.settings?.ai?.azureApiVersionPlaceholder || "2024-02-15-preview"}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>{t.settings?.ai?.azureModel || "Model Display Name"}</Label>
                                            <Input
                                                value={config.azure?.model || ''}
                                                onChange={(e) => setConfig(prev => ({ ...prev, azure: { ...prev.azure, model: e.target.value } }))}
                                                placeholder="gpt-4o"
                                            />
                                        </div>
                                    </div>
                                )}
                                {/* 测试连接和保存按钮 */}
                                <div className="space-y-3 pt-3 border-t">
                                    <div className="flex gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => handleTestConnection()}
                                            disabled={testing || saving}
                                            className="flex-1"
                                        >
                                            {testing ? (
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            ) : (
                                                <Zap className="mr-2 h-4 w-4" />
                                            )}
                                            {testing ? (t.settings?.ai?.testing || "测试中...") : (t.settings?.ai?.testConnection || "测试连接")}
                                        </Button>
                                        <Button onClick={handleSaveSettings} disabled={saving || testing} className="flex-1">
                                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            {t.settings?.ai?.save || "Save AI Settings"}
                                        </Button>
                                    </div>

                                    {/* 测试结果显示 */}
                                    {testResult && (
                                        <div className={`p-3 rounded-md text-sm ${testResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                                            <div className="flex items-center gap-2 font-medium mb-2">
                                                {testResult.success ? (
                                                    <>
                                                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                                                        <span className="text-green-700">{t.settings?.ai?.testSuccess || "连接成功"}</span>
                                                        {testResult.modelInfo && <span className="text-green-600 text-xs">({testResult.modelInfo})</span>}
                                                    </>
                                                ) : (
                                                    <>
                                                        <XCircle className="h-4 w-4 text-red-600" />
                                                        <span className="text-red-700">{t.settings?.ai?.testFailed || "连接失败"}</span>
                                                    </>
                                                )}
                                            </div>
                                            {testResult.success && (
                                                <div className="space-y-1 text-xs">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-muted-foreground">{t.settings?.ai?.textSupport || "文本生成"}:</span>
                                                        <span className="text-green-600">✓ {t.settings?.ai?.supported || "支持"}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-muted-foreground">{t.settings?.ai?.visionSupport || "图像识别/多模态"}:</span>
                                                        {testResult.visionSupport ? (
                                                            <span className="text-green-600">✓ {t.settings?.ai?.supported || "支持"}</span>
                                                        ) : (
                                                            <span className="text-amber-600">✗ {
                                                                testResult.visionError
                                                                    ? ((t.settings?.ai?.errors as Record<string, string>)?.[testResult.visionError] || testResult.visionError.replace('UNKNOWN:', ''))
                                                                    : (t.settings?.ai?.notSupported || "不支持")
                                                            }</span>
                                                        )}
                                                    </div>
                                                    <p className="text-muted-foreground/60 text-[10px] pl-1">* 由于网络问题，可能测试结果不准确</p>
                                                </div>
                                            )}
                                            {!testResult.success && testResult.textError && (
                                                <p className="text-red-600 text-xs mt-1">{
                                                    (t.settings?.ai?.errors as Record<string, string>)?.[testResult.textError]
                                                    || testResult.textError.replace('UNKNOWN:', '')
                                                }</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm text-slate-600">高级配置 · 厂商、能力与调用记录</summary><div className="mt-4"><ModelTaskPanel /></div></details>
                        </>}
                    </TabsContent>

                    {/* Prompts Tab */}
                    <TabsContent value="prompts" className="space-y-4 py-4">
                        <PromptSettings config={config} onUpdate={updatePrompts} />
                        <Button onClick={handleSaveSettings} disabled={saving} className="w-full">
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {t.settings?.prompts?.save || "Save Prompt Settings"}
                        </Button>
                    </TabsContent>

                    {/* Admin Tab */}
                    {
                        (session?.user as any)?.role === 'admin' && (
                            <TabsContent value="admin" className="space-y-4 py-4">
                                <AccountSettings />
                                <Button
                                    variant="outline"
                                    className="w-full justify-start gap-2"
                                    onClick={() => {
                                        setOpen(false)
                                        router.push("/admin")
                                    }}
                                >
                                    <BarChart3 className="h-4 w-4" />
                                    {t.admin?.dashboard?.title || "Admin Dashboard"}
                                </Button>
                                <div className="border-t pt-4">
                                    <UserManagement />
                                </div>
                            </TabsContent>
                        )
                    }

                    {/* Danger Zone Tab */}
                    <TabsContent value="danger" className="space-y-4 py-4">
                        <div className="space-y-3">
                            {/* Data Management Section - Available to all users */}
                            <div className="p-4 border border-blue-200 rounded-lg bg-blue-50">
                                <h4 className="text-sm font-bold text-blue-900 mb-3">
                                    {t.settings?.dataManagement || "Data Management"}
                                </h4>

                                {/* Export */}
                                <div className="mb-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm text-blue-800 font-medium">
                                            {t.settings?.exportData || "Export Data"}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={handleExportData}
                                                disabled={exporting}
                                                className="bg-blue-100 hover:bg-blue-200 text-blue-900 border-blue-300"
                                            >
                                                {exporting ? (
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Download className="mr-2 h-4 w-4" />
                                                )}
                                                {t.settings?.exportData || "Export"}
                                            </Button>
                                            {(session?.user as any)?.role === 'admin' && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={handleExportAllData}
                                                    disabled={exporting}
                                                    className="bg-orange-100 hover:bg-orange-200 text-orange-900 border-orange-300"
                                                >
                                                    {exporting ? (
                                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <Download className="mr-2 h-4 w-4" />
                                                    )}
                                                    {t.settings?.exportAllData || "Export All"}
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                    <p className="text-xs text-blue-700">
                                        {t.settings?.exportDataDesc || "Export all data as JSON file."}
                                    </p>
                                </div>

                                {/* Import */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm text-blue-800 font-medium">
                                            {t.settings?.importData || "Import Data"}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="file"
                                                accept=".json"
                                                onChange={handleImportFileChange}
                                                className="hidden"
                                                id="import-file-input"
                                                disabled={importing}
                                            />
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => document.getElementById('import-file-input')?.click()}
                                                disabled={importing}
                                                className="bg-blue-100 hover:bg-blue-200 text-blue-900 border-blue-300"
                                            >
                                                {importing ? (
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Upload className="mr-2 h-4 w-4" />
                                                )}
                                                {selectedFileName || t.settings?.selectFile || "Select File"}
                                            </Button>
                                            {selectedFile && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={handleImportData}
                                                    disabled={importing}
                                                    className="bg-green-100 hover:bg-green-200 text-green-900 border-green-300"
                                                >
                                                    {importing ? (
                                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <CheckCircle2 className="mr-2 h-4 w-4" />
                                                    )}
                                                    {t.settings?.importData || "Import"}
                                                </Button>
                                            )}
                                            {selectedFile && (session?.user as any)?.role === 'admin' && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={handleImportAllData}
                                                    disabled={importing}
                                                    className="bg-orange-100 hover:bg-orange-200 text-orange-900 border-orange-300"
                                                >
                                                    {importing ? (
                                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <CheckCircle2 className="mr-2 h-4 w-4" />
                                                    )}
                                                    {t.settings?.importAllData || "Import All"}
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                    <p className="text-xs text-blue-700">
                                        {t.settings?.importDataDesc || "Import data from JSON file. Existing data will be skipped."}
                                    </p>
                                </div>
                            </div>

                            {/* Migrate Tags (Admin Only) */}
                            {(session?.user as any)?.role === 'admin' && (
                                <div className="p-4 border border-blue-200 rounded-lg bg-blue-50">
                                    <div className="flex items-center justify-between">
                                        <div className="flex flex-col">
                                            <span className="text-sm text-blue-900 font-bold flex items-center gap-2">
                                                <RefreshCw className="h-4 w-4" />
                                                {t.settings?.migrateTags || "Migrate Tags"}
                                            </span>
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={handleMigrateTags}
                                            disabled={migratingTags}
                                            className="bg-blue-100 hover:bg-blue-200 text-blue-900 border-blue-300"
                                        >
                                            {migratingTags ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <RefreshCw className="h-4 w-4" />
                                            )}
                                        </Button>
                                    </div>
                                    <p className="text-xs text-blue-800 mt-2 font-medium">
                                        {t.settings?.migrateTagsDesc || 'Re-populates standard tags from file'}
                                    </p>
                                </div>
                            )}

                            {/* Clear Practice Data */}
                            <div className="p-4 border border-red-200 rounded-lg bg-red-50">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-red-700 font-medium">
                                        {t.settings?.clearData || "Clear Practice Data"}
                                    </span>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={handleClearData}
                                        disabled={clearingPractice}
                                    >
                                        {clearingPractice ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Trash2 className="h-4 w-4" />
                                        )}
                                    </Button>
                                </div>
                                <p className="text-xs text-red-600 mt-2">
                                    {t.settings?.clearDataDesc || 'This will permanently delete all practice history. Irreversible.'}
                                </p>
                            </div>

                            {/* Clear Error Data */}
                            <div className="p-4 border border-red-200 rounded-lg bg-red-50">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-red-700 font-medium">
                                        {t.settings?.clearErrorData || "Clear Error Data"}
                                    </span>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={handleClearErrorData}
                                        disabled={clearingError}
                                    >
                                        {clearingError ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Trash2 className="h-4 w-4" />
                                        )}
                                    </Button>
                                </div>
                                <p className="text-xs text-red-600 mt-2">
                                    {t.settings?.clearErrorDataDesc || 'This will permanently delete all error items. Irreversible.'}
                                </p>
                            </div>

                            {/* System Reset (Admin Only) */}
                            {(session?.user as any)?.role === 'admin' && (
                                <>
                                    {/* System Reset */}
                                    <div className="p-4 border border-red-600/50 rounded-lg bg-red-100/50">
                                        <div className="flex items-center justify-between">
                                            <div className="flex flex-col">
                                                <span className="text-sm text-red-900 font-bold flex items-center gap-2">
                                                    <AlertTriangle className="h-4 w-4" />
                                                    {t.settings?.systemReset || "System Initialization"}
                                                </span>
                                            </div>
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                onClick={handleSystemReset}
                                                disabled={systemResetting}
                                                className="bg-red-700 hover:bg-red-800"
                                            >
                                                {systemResetting ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Trash2 className="h-4 w-4" />
                                                )}
                                            </Button>
                                        </div>
                                        <p className="text-xs text-red-800 mt-2 font-medium">
                                            {t.settings?.systemResetDesc || 'Resets the system to factory state. Deletes ALL data.'}
                                        </p>
                                    </div>
                                </>
                            )}
                        </div>
                    </TabsContent>


                    </div>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}

