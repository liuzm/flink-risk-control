import React, { useState } from 'react';
import { Layout, Menu, Typography } from 'antd';
import { BrowserRouter, Routes, Route, Outlet, Navigate, useNavigate, useLocation } from 'react-router-dom';
import {
  DashboardOutlined,
  SafetyCertificateOutlined,
  AlertOutlined,
  BarChartOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import Home from './pages/Home';
import RuleList from './pages/Rule/List';
import RiskList from './pages/Risk';
import Dashboard from './pages/Dashboard';
import Landing from './pages/Landing';
import './App.css';

const { Sider, Content } = Layout;
const { Text } = Typography;

const menuItems = [
  { key: '/console', icon: <DashboardOutlined />, label: '系统概览' },
  { key: '/console/rules', icon: <SafetyCertificateOutlined />, label: '规则管理' },
  { key: '/console/risks', icon: <AlertOutlined />, label: '风险记录' },
  { key: '/console/dashboard', icon: <BarChartOutlined />, label: '数据看板' },
];

const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const selectedKey = menuItems.find((item) =>
    item.key === '/console' ? location.pathname === '/console' : location.pathname.startsWith(item.key),
  )?.key || '/console';

  return (
    <Layout className="app-layout">
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        width={220}
        className="app-sider"
      >
        <div className="app-logo" onClick={() => navigate('/console')}>
          <ThunderboltOutlined className="app-logo-icon" />
          {!collapsed && <Text className="app-logo-text">Flink 风控平台</Text>}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          className="app-menu"
        />
      </Sider>
      <Layout>
        <Content className="app-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/console" element={<AppLayout />}>
        <Route index element={<Home />} />
        <Route path="rules" element={<RuleList />} />
        <Route path="risks" element={<RiskList />} />
        <Route path="dashboard" element={<Dashboard />} />
      </Route>
      <Route path="/rules" element={<Navigate to="/console/rules" replace />} />
      <Route path="/risks" element={<Navigate to="/console/risks" replace />} />
      <Route path="/dashboard" element={<Navigate to="/console/dashboard" replace />} />
    </Routes>
  );
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
};

export default App;
