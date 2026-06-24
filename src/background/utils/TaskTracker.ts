/**
 * 简单的月度任务计数器。
 *
 * 当前项目在对局结束阶段会调用 completeTask()。
 * 这个类把计数保存在 localStorage，并且在月份变化时自动清零。
 *
 * 学习重点：
 * - 这是一个纯前端状态持久化工具，不依赖 LCU；
 * - storageKey 支持自定义，方便以后复用到其他计数场景；
 * - taskCount 上限是 24，超过后不再增加。
 */
export class TaskTracker {
	/** 当前记录对应的月份，范围 1-12。 */
	private currentMonth: number;

	/** 当前月份内已完成的任务次数。 */
	private taskCount: number;

	/** localStorage 使用的 key。 */
	private storageKey: string;

	constructor(storageKey: string = "taskTracker") {
		this.storageKey = storageKey;
		const now = new Date();
		const savedData = this.loadData();

		if (savedData) {
			// 有保存数据时先加载，再检查是否跨月。
			this.currentMonth = savedData.currentMonth;
			this.taskCount = savedData.taskCount;
			this.checkMonth();
		} else {
			// 没有保存数据时初始化当前月份和计数。
			this.currentMonth = now.getMonth() + 1;
			this.taskCount = 0;
			this.saveData();
		}
	}

	/** 保存当前计数到 localStorage。 */
	private saveData(): void {
		const data = {
			currentMonth: this.currentMonth,
			taskCount: this.taskCount,
		};
		localStorage.setItem(this.storageKey, JSON.stringify(data));
	}

	/** 从 localStorage 加载计数。 */
	private loadData(): { currentMonth: number; taskCount: number } | null {
		const data = localStorage.getItem(this.storageKey);
		return data ? JSON.parse(data) : null;
	}

	/** 检查当前月份是否变化；如果跨月则清零。 */
	private checkMonth(): void {
		const now = new Date();
		const newMonth = now.getMonth() + 1;

		if (newMonth !== this.currentMonth) {
			this.currentMonth = newMonth;
			this.taskCount = 0;
			this.saveData();
		}
	}

	/** 记录一次任务完成。 */
	public completeTask(): void {
		this.checkMonth();

		// 每月最多记录 24 次，达到上限后直接返回。
		if (this.taskCount >= 24) {
			return;
		}

		this.taskCount += 1;
		this.saveData();
	}
}
