/**
 * 清单数据（预定清单 + 出行物品）。
 * 每个 item 的 `id` 是唯一键，也是云端存储的 RowKey——请勿随意改动已有 id。
 */

// 📋 预定清单
export const GROUPS = [
  { title: '✈️ 交通', items: [
    { id: 't-out',  name: '去程机票 上海→西双版纳', meta: '7/17 KY3122 · ¥800/人', done: true,  who: '淦珺' },
    { id: 't-lj',   name: '丽江机票 西双版纳→丽江', meta: '7/21 DR5051 · ¥340/人', done: false, who: '' },
    { id: 't-back', name: '返程机票 丽江→上海',     meta: '7/25 丽江→浦东',       done: false, who: '' },
  ]},
  { title: '🚗 租车', items: [
    { id: 'car', name: '小鹏 G7 自驾', meta: '7/21–7/25 · 4天含保险 ≈¥1300', done: false, who: '' },
  ]},
  { title: '🎫 旅游门票', items: [
    { id: 'tk-snow', name: '玉龙雪山 / 蓝月谷', meta: '7/21 丽江',    done: false, who: '' },
    { id: 'tk-lugu', name: '泸沽湖景区',       meta: '7/22–7/24',   done: false, who: '' },
  ]},
  { title: '🏨 每天住宿', items: [
    { id: 'h-xsbn',  name: '西双版纳 · 温德姆至尊',      meta: '7/17–7/21 共4晚 · 豪华大床房',    done: true,  who: '淦珺' },
    { id: 'h-lj',    name: '丽江古镇住宿',              meta: '7/21 共1晚 · ≈¥300/间',          done: false, who: '' },
    { id: 'h-lugu',  name: '泸沽湖 · 前湖月遥全湖景',    meta: '7/22–7/24 共2晚 · 湖景露台大床房', done: true,  who: '雯雯' },
    { id: 'h-shuhe', name: '束河古镇 / 机场旁住宿',      meta: '7/24 共1晚',                     done: false, who: '' },
  ]},
];

// 🎒 出行物品清单（结合路线与 7 月季节整理；meta 为说明 / 建议来源）
export const PACKING = [
  { title: '🪪 证件 & 财物', items: [
    { id: 'pk-id',      name: '身份证',            meta: '登机 / 酒店入住 / 取车必备', done: false, who: '' },
    { id: 'pk-license', name: '驾驶证',            meta: '自驾取小鹏 G7 必带',         done: false, who: '' },
    { id: 'pk-phone',   name: '手机',              meta: '',                          done: false, who: '' },
    { id: 'pk-cash',    name: '现金 / 银行卡',      meta: '部分景区/小店备用',          done: false, who: '' },
    { id: 'pk-orders',  name: '机票·酒店订单截图',  meta: '离线也能查',                 done: false, who: '' },
  ]},
  { title: '🔌 电子设备', items: [
    { id: 'pk-cable',    name: '充电线',           meta: '手机 / 平板',               done: false, who: '' },
    { id: 'pk-powerbank',name: '充电宝',           meta: '登机 ≤100Wh，随身',         done: false, who: '' },
    { id: 'pk-tablet',   name: '平板电脑',         meta: '',                          done: false, who: '' },
    { id: 'pk-charger',  name: '多口充电头',       meta: '一拖多更省插座',             done: false, who: '' },
    { id: 'pk-earphone', name: '耳机',             meta: '',                          done: false, who: '' },
    { id: 'pk-carmount', name: '车载手机支架',      meta: '自驾导航用',                 done: false, who: '' },
  ]},
  { title: '👕 衣物', items: [
    { id: 'pk-tee',      name: '透气短袖 / 短裤',   meta: '西双版纳炎热',               done: false, who: '' },
    { id: 'pk-jacket',   name: '薄外套 / 薄羽绒',   meta: '丽江·泸沽湖高原昼夜温差大',   done: false, who: '' },
    { id: 'pk-swim',     name: '泳衣 / 泳镜',       meta: '酒店泳池',                   done: false, who: '' },
    { id: 'pk-underwear',name: '换洗内衣 / 袜',     meta: '',                          done: false, who: '' },
    { id: 'pk-shoes',    name: '舒适步行鞋',        meta: '古镇/雪山下多走路',          done: false, who: '' },
    { id: 'pk-slippers', name: '拖鞋',             meta: '',                          done: false, who: '' },
    { id: 'pk-hat',      name: '遮阳帽',           meta: '高原紫外线强',               done: false, who: '' },
    { id: 'pk-rain',     name: '折叠伞 / 雨衣',     meta: '7 月雨季，常备',             done: false, who: '' },
  ]},
  { title: '🧴 洗漱 & 护肤', items: [
    { id: 'pk-wash',      name: '洗漱用品',         meta: '牙刷牙膏/毛巾等',            done: false, who: '' },
    { id: 'pk-sunscreen', name: '防晒霜 SPF50',    meta: '高原紫外线强，务必高倍',      done: false, who: '' },
    { id: 'pk-sunglass',  name: '墨镜',            meta: '雪山/湖面反光',              done: false, who: '' },
    { id: 'pk-lipbalm',   name: '润唇膏 / 保湿霜',  meta: '高原干燥',                   done: false, who: '' },
    { id: 'pk-repellent', name: '驱蚊液',          meta: '西双版纳热带雨林蚊虫多',      done: false, who: '' },
  ]},
  { title: '💊 药品 & 健康', items: [
    { id: 'pk-altitude', name: '抗高反药（红景天等）', meta: '玉龙雪山/泸沽湖高海拔',    done: false, who: '' },
    { id: 'pk-cold',     name: '感冒 / 肠胃药',       meta: '',                        done: false, who: '' },
    { id: 'pk-motion',   name: '晕车药',             meta: '山路自驾/盘山路',          done: false, who: '' },
    { id: 'pk-firstaid', name: '创可贴 / 常用药',     meta: '',                        done: false, who: '' },
  ]},
  { title: '🎒 其他', items: [
    { id: 'pk-backpack', name: '双肩包 / 小挎包',    meta: '一日游随身',               done: false, who: '' },
    { id: 'pk-bottle',   name: '保温杯',            meta: '高原多补水',               done: false, who: '' },
    { id: 'pk-wipes',    name: '湿巾 / 纸巾',        meta: '',                        done: false, who: '' },
    { id: 'pk-drybag',   name: '防水袋 / 收纳袋',    meta: '雨季/泸沽湖船上护手机',     done: false, who: '' },
  ]},
];
