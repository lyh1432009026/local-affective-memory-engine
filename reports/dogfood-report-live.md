# 🐶 本地记忆与情感伴生引擎 v2.4 纯真实在线对决狗粮报告

**生成时间**：2026/11/7 17:00:05  
**大模型网关**：https://api.deepseek.com/v1  
**驱动模型**：`deepseek-flash` (无任何预设剧本，100% 实时在线双向对抗)  
**伴生引擎模式**：Inline 双流首行标签 + sqlite-vec 向量检索 + 连续情感动力学  

---

## 一、 核心战果概览
- **实测总轮次**：2 轮
- **全量冷归档记录**：27 条
- **沉淀真实情景向量记忆**：25 条
- **生成阶段叙事篇章**：11 篇
- **终局情感基态**：P=-0.14, A=0.77, D=0.32
- **终局羁绊指数**：亲密度: 56.4% | 信任度: 51.4%

---

## 二、 实时交锋全纪录

### 🚩 第 1 轮交锋 [姿态: 极简高密攻坚姿态]
- **P/A/D**: P=-0.14, A=0.78, D=0.34 | 亲密: 56% | 信任: 52%
- **业务开发·小张**:
> 【线上紧急报警】
java.sql.SQLTransientConnectionException: HikariPool-1 - Connection is not available, request timed out after 30000ms.
架构师快看！秒杀刚压测第一波，数据库连接池直接被打空了！我打算直接把 maximum-pool-size 从 20 改成 2000，先顶过去行不行？
- **挑剔架构师·马库斯**:
> **不行。2000 不是"顶过去"，是给数据库判死刑。**

MySQL 默认 `max_connections=151`，PG 默认 100。你甩 2000 个连接过去，结果只有两种：DB 侧直接拒绝（剩下全变 timeout，你换个地方继续雪崩），或者线程/内存被拖爆，从"接口全挂"升级成"整库全挂"。

**连接池不是并发放大器，它本身就是限流器。** 池被打空说明 `QPS × 连接持有时间 > 池容量`，或者干脆有泄漏。把池调大只是把雪崩推迟 3 秒，然后崩得更彻底——连接数超过 DB 的并行处理能力后，Tps 是往下走的（上下文切换 + 行锁竞争 + buffer pool 抖动）。

压测第一波就打空，八成是这三条之一：
1. **长事务占连接**：事务里套 RPC/Redis/HTTP，或 `select ... for update` 拿着锁等。
2. **慢 SQL 拖住连接**：循环查库、无索引扫描、大结果集。
3. **连接泄漏**：手动 `getConnection()` 没 close，try-with-resources 写漏了。

立即动作，池子先别动：

```yaml
spring.datasource.hikari.leak-detection-threshold: 5000   # 5s 未归还打印堆栈


### 🚩 第 2 轮交锋 [姿态: 极简高密攻坚姿态]
- **P/A/D**: P=-0.14, A=0.77, D=0.32 | 亲密: 56% | 信任: 51%
- **业务开发·小张**:
> 压测又报错了，快帮我看一下！
- **挑剔架构师·马库斯**:
> 第四次了，还是零信息。堆栈没有、异常类名没有、你改了什么没有、哪个接口炸的也没有。你让我看空气？

**先回答我三个问题，答不上来就别再发"又报错了"：**

1. **异常全名是什么？** 还是 `SQLTransientConnectionException`，还是换了？把 `Caused by` 那几行贴全。
2. **你动过什么？** 上一轮我列的 `leak-detection-threshold` 加了没？pool size 你到底改没改成 2000？改了就直说，现在的报错很可能是你自己造的新坑。
3. **哪个接口、什么现象？** 是启动就挂、压测第几秒挂、还是全链路 5xx？

**在你贴信息之前，先跑这三条把证据抓出来：**

```bash
# 1. 连接池实时状态：active 是不是卡在最大值不动
curl -s http://localhost:8080/actuator/metrics/hikaricp.connections.active
curl -s http://localhost:8080/actuator/metrics/hikaricp.connections.pending   # 排队数，>0 就是真打满
curl -s http://localhost:8080/actuator/metrics/hikaricp.connections.timeout
```

```sql
-- 2. 数据库侧看谁在占着连接不放（MySQL）
SELECT id, user, host, db, command, time, state, LEFT(info,120)
FROM information_schema.processlist
WHERE command != 'Sleep' ORDER BY time DESC LIMIT 30;
```

```bash
# 3. 应用侧抓线程栈，看卡在哪一行
jstack <pid> > /tmp/stack.txt
grep -A 30 "HikariPool" /tmp/stack.txt | head -80
```

第 2 条是关键：**如果 `processlist` 里一堆 `Sleep` 或者同一个 SQL 挂了几十秒，那根本不是池子小，是有人拿着连接在事务里等外部调用**。池子调多大都会被吃干净。

带信息来。别再让我猜。

