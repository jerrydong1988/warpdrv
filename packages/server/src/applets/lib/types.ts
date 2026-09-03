import type { EventNode } from "@warpcore/realmcore";
import type { TAppletBaseAPI } from "@warpcore/realmcore";

export interface IAppletAPIBE extends TAppletBaseAPI {
	eventNode: EventNode;
}
