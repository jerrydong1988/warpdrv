import type { EventNode } from '@warpcore/realmcore';
import { TAppletBaseAPI } from '@warpcore/realmcore';

export interface IAppletAPIBE extends TAppletBaseAPI {
	eventNode: EventNode;
}
