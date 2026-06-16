import type { JSX } from 'react';
import { useState } from 'react';
import { Alert, Button, Card, Form, Input, Space } from 'antd';
import { LogIn, ShieldCheck } from 'lucide-react';
import type { UserAuthSession } from '../../shared/types';

interface PhoneLoginPageProps {
  onLoggedIn: (session: UserAuthSession) => void;
}

export function PhoneLoginPage({ onLoggedIn }: PhoneLoginPageProps): JSX.Element {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form] = Form.useForm<{ phone: string }>();

  async function submit(): Promise<void> {
    setLoading(true);
    setError('');
    try {
      const values = await form.validateFields();
      const result = await window.electron.loginWithPhone(values.phone);
      if (!result.authorized) {
        setError(result.message || '这个手机号还没有后台授权，请联系管理员');
        return;
      }
      onLoggedIn(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <Card className="login-card" variant="borderless">
        <Space direction="vertical" size={18} className="full-width">
          <div className="login-head">
            <div className="login-mark"><ShieldCheck size={24} /></div>
            <div>
              <span>陪练猫工具包</span>
              <h1>手机号授权登录</h1>
            </div>
          </div>
          {error && <Alert type="error" showIcon message={error} />}
          <Form form={form} layout="vertical" onFinish={submit}>
            <Form.Item
              name="phone"
              label="手机号"
              rules={[
                { required: true, message: '请输入手机号' },
                { pattern: /^1\d{10}$/u, message: '请输入 11 位手机号' }
              ]}
            >
              <Input size="large" placeholder="输入已授权手机号" maxLength={11} inputMode="numeric" />
            </Form.Item>
            <Button type="primary" htmlType="submit" icon={<LogIn size={16} />} loading={loading} block size="large">
              登录并校验授权
            </Button>
          </Form>
          <div className="login-note">只有后台授权过的手机号可以使用内容生成、朋友圈和图文功能。</div>
        </Space>
      </Card>
    </div>
  );
}
