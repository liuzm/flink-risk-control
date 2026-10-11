import React, { useState } from 'react';
import {
  ApiOutlined,
  ApartmentOutlined,
  ArrowRightOutlined,
  CheckOutlined,
  DatabaseOutlined,
  LockOutlined,
  RadarChartOutlined,
  SafetyCertificateFilled,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import './index.css';

const capabilities = [
  {
    icon: <ThunderboltOutlined />,
    index: '01',
    title: '毫秒级在线决策',
    copy: '统一接入登录、支付、提现和营销请求，在一次调用中完成特征计算、规则编排与风险处置。',
    meta: 'P95 LATENCY TARGET < 200MS',
  },
  {
    icon: <RadarChartOutlined />,
    index: '02',
    title: '流式风险检测',
    copy: '基于 Flink CEP 识别频次、序列、窗口与团伙行为，让跨事件风险在发生过程中被发现。',
    meta: 'REAL-TIME STREAM / CEP',
  },
  {
    icon: <ApartmentOutlined />,
    index: '03',
    title: '可视化策略中心',
    copy: '规则、规则集、灰度、版本与回放在一个工作台完成，业务和风控可以共同维护策略。',
    meta: 'VERSIONED & EXPLAINABLE',
  },
  {
    icon: <LockOutlined />,
    index: '04',
    title: '租户级安全边界',
    copy: 'Tenant、Application、Environment 三层边界贯穿鉴权、计算、存储、消息与审计。',
    meta: 'TENANT-FIRST BY DESIGN',
  },
];

const securityItems = [
  ['身份与权限', '平台与租户双域 RBAC；支持成员、角色、数据范围与高危操作复核。'],
  ['数据与密钥', '传输与存储加密；租户密钥、敏感字段脱敏和保留周期可独立配置。'],
  ['运行时隔离', '共享、增强隔离和专属资源池三种模式，按业务阶段平滑升级。'],
  ['审计与合规', '策略发布、权限变更、数据访问和人工处置全链路留痕，可检索、可导出。'],
];

const faqs = [
  ['RiskFlow 适合哪些业务？', '适用于账号安全、支付交易、信贷准入、营销反作弊、内容与 API 防滥用等需要实时判断的业务。平台以事件和决策为核心，不绑定单一行业。'],
  ['接入现有系统需要多久？', '标准 REST API 与 Webhook 可在数天内完成首个场景联调；复杂场景可通过 SDK、消息流和批量数据通道逐步接入。'],
  ['多租户之间如何隔离？', '每次请求都会解析 Tenant、Application 与 Environment 上下文，并将其注入权限、策略、特征、Topic、存储键和审计记录。企业版还可选择专属计算与存储资源。'],
  ['价格是否包含超额用量？', '套餐包含对应事件额度。超出后可以按量扩展或升级套餐；企业客户可根据峰值吞吐、数据保留和 SLA 组合定价。'],
];

const Landing: React.FC = () => {
  const [annualBilling, setAnnualBilling] = useState(true);

  return (
    <main className="landing-shell">
      <header className="landing-nav">
        <a className="landing-brand" href="#top" aria-label="RiskFlow 首页">
          <span className="landing-brand-mark"><SafetyCertificateFilled /></span>
          <span>RISKFLOW</span>
        </a>
        <nav className="landing-nav-links" aria-label="官网导航">
          <a href="#product">产品</a>
          <a href="#architecture">架构</a>
          <a href="#security">安全</a>
          <a href="#pricing">价格</a>
        </nav>
        <Link className="landing-console-link" to="/console">
          <span>进入控制台</span> <ArrowRightOutlined />
        </Link>
      </header>

      <section className="landing-hero" id="top">
        <div className="hero-aura" aria-hidden="true" />
        <div className="hero-copy">
          <div className="hero-eyebrow"><span /> 企业级实时风控 SaaS</div>
          <h1>让每一次关键交互，<br /><em>都先经过智能决策。</em></h1>
          <p>
            在线决策、流式检测与多租户安全隔离融为一体。
            用一套可解释的风控云，守住登录、交易与营销增长。
          </p>
          <div className="hero-actions">
            <a className="hero-primary" href="#contact">预约产品演示 <ArrowRightOutlined /></a>
            <a className="hero-secondary" href="#architecture">查看产品架构</a>
          </div>
          <div className="hero-proof">
            <span><strong>&lt; 200ms</strong> 在线决策目标</span>
            <span><strong>7×24</strong> 实时行为检测</span>
            <span><strong>Tenant-first</strong> 全链路隔离</span>
          </div>
        </div>

        <div className="hero-product" aria-label="实时风控决策界面示意">
          <div className="product-topbar">
            <div className="product-dots"><i /><i /><i /></div>
            <span>LIVE DECISION ENGINE</span>
            <b><i /> HEALTHY</b>
          </div>
          <div className="product-grid">
            <div className="signal-panel">
              <span className="panel-kicker">SIGNAL STREAM</span>
              <div className="signal-row"><i className="signal-cyan" /><span>LOGIN</span><b>device_risk</b><em>12ms</em></div>
              <div className="signal-row"><i className="signal-lime" /><span>ORDER</span><b>velocity_3m</b><em>18ms</em></div>
              <div className="signal-row"><i className="signal-violet" /><span>COUPON</span><b>graph_match</b><em>23ms</em></div>
              <div className="signal-wave" aria-hidden="true">
                <i /><i /><i /><i /><i /><i /><i /><i /><i /><i />
              </div>
            </div>
            <div className="decision-panel">
              <span className="panel-kicker">DECISION / RF-94028</span>
              <div className="decision-score">
                <div><span>87</span><small>RISK SCORE</small></div>
                <b>HIGH</b>
              </div>
              <div className="decision-path">
                <span className="done">01</span><i /><span className="done">02</span><i /><span className="active">03</span>
              </div>
              <div className="decision-copy"><span>ACTION</span><strong>BLOCK &amp; REVIEW</strong></div>
              <div className="decision-meta"><span>Matched rules</span><b>4 / 268</b></div>
              <div className="decision-meta"><span>Snapshot</span><b>prod.2026.08.16</b></div>
            </div>
          </div>
          <div className="product-footer">
            <span><i /> 2,841 events / sec</span>
            <span>P95 latency <b>86ms</b></span>
            <span>Tenant <b>ACME / PROD</b></span>
          </div>
        </div>
      </section>

      <section className="principle-strip" aria-label="产品原则">
        <span>ONLINE DECISION</span><i />
        <span>STREAM DETECTION</span><i />
        <span>EXPLAINABLE POLICY</span><i />
        <span>TENANT-FIRST</span>
      </section>

      <section className="landing-section product-section" id="product">
        <div className="section-heading">
          <div>
            <span className="section-kicker">PRODUCT SYSTEM / 01</span>
            <h2>不是规则列表，<br />是一套持续运转的决策系统。</h2>
          </div>
          <p>把数据接入、风险识别、策略决策、处置反馈与效果分析连成闭环，让风控能力从一次性交付变为可运营的基础设施。</p>
        </div>

        <div className="capability-grid">
          {capabilities.map((item) => (
            <article className="capability-card" key={item.index}>
              <div className="capability-card-top">
                <span className="capability-icon">{item.icon}</span>
                <em>{item.index}</em>
              </div>
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
              <span className="capability-meta">{item.meta}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section architecture-section" id="architecture">
        <div className="architecture-copy">
          <span className="section-kicker">ARCHITECTURE / 02</span>
          <h2>一条风险链路，<br />两套稳定平面。</h2>
          <p>控制平面管理租户、成员、策略、版本与审计；数据平面专注事件摄取、实时计算和在线决策。配置变更不会直接干扰关键交易链路。</p>
          <ul>
            <li><CheckOutlined /> 发布前校验、仿真、灰度和快速回滚</li>
            <li><CheckOutlined /> 策略快照与决策结果可完整追溯</li>
            <li><CheckOutlined /> 流量、状态与资源按租户上下文路由</li>
          </ul>
          <a href="#contact">获取架构白皮书 <ArrowRightOutlined /></a>
        </div>

        <div className="architecture-visual" aria-label="RiskFlow 风控处理链路">
          <div className="plane-label"><span>DATA PLANE</span><b>REAL-TIME</b></div>
          <div className="architecture-flow">
            <div className="flow-node"><ApiOutlined /><span>01</span><strong>事件接入</strong><small>API · SDK · MQ</small></div>
            <i />
            <div className="flow-node"><ApartmentOutlined /><span>02</span><strong>租户路由</strong><small>TENANT CONTEXT</small></div>
            <i />
            <div className="flow-node active"><RadarChartOutlined /><span>03</span><strong>实时计算</strong><small>FLINK · CEP · FEATURE</small></div>
            <i />
            <div className="flow-node"><ThunderboltOutlined /><span>04</span><strong>在线决策</strong><small>RULE · SCORE · MODEL</small></div>
            <i />
            <div className="flow-node"><DatabaseOutlined /><span>05</span><strong>结果闭环</strong><small>CASE · AUDIT · BI</small></div>
          </div>
          <div className="control-plane">
            <span>CONTROL PLANE</span>
            <div><b>Tenant &amp; IAM</b><b>Policy Studio</b><b>Release Center</b><b>Observability</b></div>
          </div>
          <div className="architecture-metrics">
            <span><small>EVENT INGEST</small><strong>100K+</strong><em>EPS / CLUSTER</em></span>
            <span><small>DECISION SLA</small><strong>99.99%</strong><em>ENTERPRISE</em></span>
            <span><small>TRACEABILITY</small><strong>100%</strong><em>SNAPSHOT LINKED</em></span>
          </div>
        </div>
      </section>

      <section className="landing-section scenes-section">
        <div className="section-heading compact">
          <div>
            <span className="section-kicker">USE CASES / 03</span>
            <h2>从账号安全，到每一笔增长。</h2>
          </div>
          <p>以统一事件模型和策略资产覆盖不同风险域，降低重复建设成本。</p>
        </div>
        <div className="scene-grid">
          <article>
            <span className="scene-number">01</span>
            <div className="scene-tag">ACCOUNT</div>
            <h3>账号与身份安全</h3>
            <p>撞库、盗号、设备异常、异地登录、批量注册与 API 滥用。</p>
            <ul><li>设备指纹</li><li>行为序列</li><li>关系识别</li></ul>
          </article>
          <article>
            <span className="scene-number">02</span>
            <div className="scene-tag">TRANSACTION</div>
            <h3>支付与交易风险</h3>
            <p>异常下单、支付欺诈、盗刷、套现、提现风险与交易争议。</p>
            <ul><li>频次窗口</li><li>金额画像</li><li>实时拦截</li></ul>
          </article>
          <article>
            <span className="scene-number">03</span>
            <div className="scene-tag">GROWTH</div>
            <h3>营销与权益防刷</h3>
            <p>优惠券套利、活动刷量、羊毛党团伙与渠道流量作弊。</p>
            <ul><li>团伙网络</li><li>活动策略</li><li>名单联动</li></ul>
          </article>
        </div>
      </section>

      <section className="landing-section security-section" id="security">
        <div className="security-board">
          <div className="security-copy">
            <span className="section-kicker">SECURITY / 04</span>
            <h2>多租户不是字段，<br />而是系统边界。</h2>
            <p>RiskFlow 从身份入口开始传播租户上下文，在每一层执行最小权限和数据边界，并为高敏业务提供更强的物理隔离选项。</p>
            <div className="security-stamp"><SafetyCertificateFilled /><span><strong>ZERO TRUST CONTEXT</strong><small>IDENTITY · POLICY · DATA · AUDIT</small></span></div>
          </div>
          <div className="isolation-stack" aria-label="租户隔离层级">
            <div><span>01</span><b>TENANT</b><em>组织与合同边界</em></div>
            <div><span>02</span><b>APPLICATION</b><em>业务与密钥边界</em></div>
            <div><span>03</span><b>ENVIRONMENT</b><em>DEV / TEST / PROD</em></div>
            <div><span>04</span><b>RESOURCE</b><em>Topic · State · Storage</em></div>
          </div>
        </div>
        <div className="security-grid">
          {securityItems.map(([title, copy], index) => (
            <article key={title}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section pricing-section" id="pricing">
        <div className="pricing-heading">
          <div>
            <span className="section-kicker">PRICING / 05</span>
            <h2>从验证场景，到关键业务。</h2>
            <p>套餐按月度事件量、策略规模与服务等级划分。所有版本都包含核心在线决策能力。</p>
          </div>
          <div className="billing-toggle" aria-label="计费周期">
            <button type="button" className={!annualBilling ? 'active' : ''} onClick={() => setAnnualBilling(false)}>月付</button>
            <button type="button" className={annualBilling ? 'active' : ''} onClick={() => setAnnualBilling(true)}>年付 <span>省 2 个月</span></button>
          </div>
        </div>

        <div className="pricing-grid">
          <article className="price-card">
            <span className="plan-kicker">DEVELOPER</span>
            <h3>开发者版</h3>
            <p>快速验证第一个风险场景。</p>
            <div className="price"><small>¥</small><strong>0</strong><em>/ 月</em></div>
            <Link className="plan-button secondary" to="/console">免费开始 <ArrowRightOutlined /></Link>
            <ul>
              <li><CheckOutlined /> 50 万事件 / 月</li>
              <li><CheckOutlined /> 2 个应用 · 20 条生效规则</li>
              <li><CheckOutlined /> 7 天数据保留</li>
              <li><CheckOutlined /> DEV / TEST 环境</li>
            </ul>
          </article>

          <article className="price-card featured">
            <div className="popular-tag">MOST POPULAR</div>
            <span className="plan-kicker">PROFESSIONAL</span>
            <h3>专业版</h3>
            <p>面向正式生产与风控团队协作。</p>
            <div className="price"><small>¥</small><strong>{annualBilling ? '3,333' : '3,999'}</strong><em>/ 月</em></div>
            <span className="billing-note">{annualBilling ? '¥39,996 / 年，一次性支付' : '按月支付，可随时升级'}</span>
            <a className="plan-button primary" href="#contact">预约开通 <ArrowRightOutlined /></a>
            <ul>
              <li><CheckOutlined /> 2,000 万事件 / 月</li>
              <li><CheckOutlined /> 10 个应用 · 300 条生效规则</li>
              <li><CheckOutlined /> 90 天数据保留</li>
              <li><CheckOutlined /> PROD · Webhook · 案件审核</li>
            </ul>
          </article>

          <article className="price-card">
            <span className="plan-kicker">ENTERPRISE</span>
            <h3>企业版</h3>
            <p>关键业务、专属资源与合规要求。</p>
            <div className="price custom"><strong>定制</strong></div>
            <a className="plan-button secondary" href="#contact">联系顾问 <ArrowRightOutlined /></a>
            <ul>
              <li><CheckOutlined /> 1 亿+ 事件 / 月</li>
              <li><CheckOutlined /> 专属 Topic、计算与存储</li>
              <li><CheckOutlined /> SSO · 高级 RBAC · 自定义审计</li>
              <li><CheckOutlined /> 99.99% SLA 与专属支持</li>
            </ul>
          </article>
        </div>
        <p className="pricing-footnote">以上为公测建议价，正式商务条款以合同为准；超额事件量、数据保留与专属资源可按需扩展。</p>
      </section>

      <section className="landing-section faq-section">
        <div className="faq-heading">
          <span className="section-kicker">FAQ / 06</span>
          <h2>开始之前，<br />你可能还想知道。</h2>
        </div>
        <div className="faq-list">
          {faqs.map(([question, answer], index) => (
            <details key={question} open={index === 0}>
              <summary><span>{String(index + 1).padStart(2, '0')}</span><strong>{question}</strong><i>+</i></summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="contact-section" id="contact">
        <div className="contact-aura" aria-hidden="true" />
        <div className="contact-copy">
          <span className="section-kicker">BUILD WITH CONFIDENCE</span>
          <h2>把风险判断，<br />变成增长的确定性。</h2>
          <p>带上你的业务场景和峰值流量，我们会为你准备一场 45 分钟的产品与架构演示。</p>
        </div>
        <div className="contact-action">
          <a className="contact-primary" href="mailto:hello@riskflow.cloud?subject=预约 RiskFlow 产品演示">预约一对一演示 <ArrowRightOutlined /></a>
          <Link className="contact-secondary" to="/console">先体验控制台</Link>
          <span>工作日 1 个工作日内响应</span>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="footer-brand">
          <a className="landing-brand" href="#top"><span className="landing-brand-mark"><SafetyCertificateFilled /></span><span>RISKFLOW</span></a>
          <p>面向关键业务的实时智能风控平台。</p>
        </div>
        <div className="footer-links">
          <div><strong>产品</strong><a href="#product">核心能力</a><a href="#architecture">产品架构</a><a href="#pricing">价格方案</a></div>
          <div><strong>场景</strong><a href="#product">账号安全</a><a href="#product">交易风控</a><a href="#product">营销反作弊</a></div>
          <div><strong>资源</strong><a href="#security">安全与合规</a><a href="#architecture">架构白皮书</a><Link to="/console">开发者控制台</Link></div>
        </div>
        <div className="footer-bottom"><span>© 2026 RiskFlow. Built for real-time decisions.</span><span>Privacy · Terms · Security</span></div>
      </footer>
    </main>
  );
};

export default Landing;
