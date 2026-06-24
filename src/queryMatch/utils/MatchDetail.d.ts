/**
 * 对局详情相关类型定义。
 *
 * 这些 interface 主要服务于：
 * - src/queryMatch/utils/matchDetails.ts 的 LCU 对局详情转换；
 * - matchContent、GameEnd、recentMatch 详情抽屉等展示组件。
 *
 * 大多数字段直接对应 LCU /lol-match-history/v1/games/{gameId} 返回结构，
 * 少数字段是 Frank 转换后的页面展示结构。
 */
export interface MatchItem {
  /** 是否展示在左侧队伍。 */
  isLeft: boolean
  /** 当前队伍或当前列表下的召唤师详情。 */
  detailInfo: SummonerDetailInfo[],
  /** 当前展示的柱状/百分比字段。 */
  showTypeKey: 'totalDamageDealtToChampions' | 'totalDamageTaken' | 'goldEarned' | 'visionScore' | 'totalMinionsKilled',
  showTypeIndex: number,
  querySumDetail: Function
}

/** 页面统计最大值列表。 */
export interface MaxValueList {
  tddtc: number,
  tdt: number,
  ge: number,
  vs: number,
  tmk: number
}

/** 召唤师详情弹窗的基础信息。 */
export interface SumDetail {
  name: string;
  champImgUrl: string;
  champLevel: number;
  kda: string;
  spell1Id: number;
  spell2Id: number;
  runesList: number[];
  listItemData: any[][];
  rankData: string[];
  summonerId: number;
}

/** LCU participantIdentities 中的 player 字段。 */
interface Player {
  accountId: number;
  currentAccountId: number;
  currentPlatformId: string;
  matchHistoryUri: string;
  platformId: string;
  profileIcon: number;
  summonerId: number;
  summonerName: string;
  gameName: string;
  puuid:string;
}

export interface ParticipantIdentity {
  participantId: number;
  player: Player;
}

/** matchDetails.ts 内部使用的召唤师名称/平台信息简化结构。 */
export interface SumPlatInfo {
  puuid: string;
  name: string;
  summonerId: number;
}

/** LCU 对局详情中单个参与者的 stats 字段。 */
export interface Stat {
  assists: number;
  causedEarlySurrender: boolean;
  champLevel: number;
  combatPlayerScore: number;
  damageDealtToObjectives: number;
  damageDealtToTurrets: number;
  damageSelfMitigated: number;
  deaths: number;
  doubleKills: number;
  earlySurrenderAccomplice: boolean;
  firstBloodAssist: boolean;
  firstBloodKill: boolean;
  firstInhibitorAssist: boolean;
  firstInhibitorKill: boolean;
  firstTowerAssist: boolean;
  firstTowerKill: boolean;
  gameEndedInEarlySurrender: boolean;
  gameEndedInSurrender: boolean;
  goldEarned: number;
  goldSpent: number;
  inhibitorKills: number;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;
  killingSprees: number;
  kills: number;
  largestCriticalStrike: number;
  largestKillingSpree: number;
  largestMultiKill: number;
  longestTimeSpentLiving: number;
  magicDamageDealt: number;
  magicDamageDealtToChampions: number;
  magicalDamageTaken: number;
  neutralMinionsKilled: number;
  neutralMinionsKilledEnemyJungle: number;
  neutralMinionsKilledTeamJungle: number;
  objectivePlayerScore: number;
  participantId: number;
  pentaKills: number;
  perk0: number;
  perk0Var1: number;
  perk0Var2: number;
  perk0Var3: number;
  perk1: number;
  perk1Var1: number;
  perk1Var2: number;
  perk1Var3: number;
  perk2: number;
  perk2Var1: number;
  perk2Var2: number;
  perk2Var3: number;
  perk3: number;
  perk3Var1: number;
  perk3Var2: number;
  perk3Var3: number;
  perk4: number;
  perk4Var1: number;
  perk4Var2: number;
  perk4Var3: number;
  perk5: number;
  perk5Var1: number;
  perk5Var2: number;
  perk5Var3: number;
  perkPrimaryStyle: number;
  perkSubStyle: number;
  physicalDamageDealt: number;
  physicalDamageDealtToChampions: number;
  physicalDamageTaken: number;
  playerScore0: number;
  playerScore1: number;
  playerScore2: number;
  playerScore3: number;
  playerScore4: number;
  playerScore5: number;
  playerScore6: number;
  playerScore7: number;
  playerScore8: number;
  playerScore9: number;
  quadraKills: number;
  sightWardsBoughtInGame: number;
  teamEarlySurrendered: boolean;
  timeCCingOthers: number;
  totalDamageDealt: number;
  totalDamageDealtToChampions: number;
  totalDamageTaken: number;
  totalHeal: number;
  totalMinionsKilled: number;
  totalPlayerScore: number;
  totalScoreRank: number;
  totalTimeCrowdControlDealt: number;
  totalUnitsHealed: number;
  tripleKills: number;
  trueDamageDealt: number;
  trueDamageDealtToChampions: number;
  trueDamageTaken: number;
  turretKills: number;
  unrealKills: number;
  visionScore: number;
  visionWardsBoughtInGame: number;
  wardsKilled: number;
  wardsPlaced: number;
  win: boolean;
}

interface CreepsPerMinDelta {
  "0-10": number;
  "10-20": number;
}

interface CsDiffPerMinDelta {
}

interface DamageTakenDiffPerMinDelta {
}

interface DamageTakenPerMinDelta {
  "0-10": number;
  "10-20": number;
}

interface GoldPerMinDelta {
  "0-10": number;
  "10-20": number;
}

interface XpDiffPerMinDelta {
}

interface XpPerMinDelta {
  "0-10": number;
  "10-20": number;
}

interface Timeline {
  creepsPerMinDeltas: CreepsPerMinDelta;
  csDiffPerMinDeltas: CsDiffPerMinDelta;
  damageTakenDiffPerMinDeltas: DamageTakenDiffPerMinDelta;
  damageTakenPerMinDeltas: DamageTakenPerMinDelta;
  goldPerMinDeltas: GoldPerMinDelta;
  lane: string;
  participantId: number;
  role: string;
  xpDiffPerMinDeltas: XpDiffPerMinDelta;
  xpPerMinDeltas: XpPerMinDelta;
}

/** LCU 对局详情中的单个参与者。 */
export interface Participant {
  championId: number;
  highestAchievedSeasonTier: string;
  participantId: number;
  spell1Id: number;
  spell2Id: number;
  stats: Stat;
  teamId: number;
  timeline: Timeline;
}

interface Ban {
  championId: number;
  pickTurn: number;
}

interface Team {
  bans: Ban[];
  baronKills: number;
  dominionVictoryScore: number;
  dragonKills: number;
  firstBaron: boolean;
  firstBlood: boolean;
  firstDargon: boolean;
  firstInhibitor: boolean;
  firstTower: boolean;
  inhibitorKills: number;
  riftHeraldKills: number;
  teamId: number;
  towerKills: number;
  vilemawKills: number;
  win: string;
}

/** LCU 对局详情完整响应。 */
export interface GameDetailedInfo {
  gameCreation: number;
  gameCreationDate: string;
  gameDuration: number;
  gameId: number;
  gameMode: string;
  gameType: string;
  gameVersion: string;
  mapId: number;
  participantIdentities: ParticipantIdentity[];
  participants: Participant[];
  platformId: string;
  queueId: number;
  seasonId: number;
  teams: Team[];
}

/** 页面最终展示的单个召唤师详情。 */
export interface SummonerDetailInfo {
  name: string;
  accountId: number;
  puuid:string;
  isCurSum: boolean,
  teamType: number;
  champLevel: number;
  champImgUrl: string;
  spell1Id: number;
  spell2Id: number;
  items: number[];
  kills: number;
  deaths: number;
  assists: number;
  physicalDamageDealtToChampions: number;
  magicDamageDealtToChampions: number;
  trueDamageDealtToChampions: number;
  totalDamageDealtToChampions: number;
  totalDamageTaken: number;
  neutralMinionsKilled: number;
  totalMinionsKill: number;
  goldEarned: number;
  goldSpent: number;
  visionScore: number;
  wardsPlaced: number;
  runesList: number[];
  totalMinionsKilled: number;
  iconList: string[],
  score: string,
  isWin: boolean,
  isMvp: boolean,
  showDataDict: ShowDataTypes
}

/** 页面展示所需的整局对局详情结构。 */
export interface ParticipantsInfo {
  teamOne: SummonerDetailInfo[],
  teamTwo: SummonerDetailInfo[],
  headerInfo: string[],
  queueId:number,
  gameId:number
}

export interface MatchHistoryTypes {
  sumId: number
  puuid: string,
  begIndex: string,
  endIndex: string,
  openSumDetailDrawer: Function,
  matchMode: string
}

/** matchDetails.ts 用来计算全场最高值的数据结构。 */
export interface MaxMatchData {
  kills: number;
  assists: number;
  turretKills: number;
  totalDamageDealtToChampions: number;
  totalMinionsKilled: number;
  goldEarned: number;
  totalDamageTaken: number;
  visionScore: number;
}
export interface PropertiesToCompareTypes {
  kills: number;
  assists: number;
  turretKills: number;
  totalDamageDealtToChampions: number;
  totalMinionsKilled: number;
  goldEarned: number;
  totalDamageTaken: number;
  visionScore: number;
}

/** 页面中用于计算横向百分比条的数据。 */
export interface ShowDataTypes {
  totalDamageDealtToChampions: number,
  totalDamageTaken: number,
  goldEarned: number,
  visionScore: number,
  totalMinionsKilled: number
}
