import {
  ActorRefFrom,
  AnyActorRef,
  AnyEventObject,
  enqueueActions,
  sendTo,
  setup,
} from 'xstate';
import { ActorSystemIds } from '../../application/actorIds';
import { Permission } from '../../permission.types';

export const permissionReportingMachine = setup({
  // TODO: type these parents to ensure they accept the events we want to send them
  types: {
    input: {} as {
      permissions: Array<Permission>;
      parent: AnyActorRef;
    },
    context: {} as {
      permissions: Array<Permission>;
      parent: AnyActorRef;
    },
    events: {} as {
      type: 'requestPermission';
      permission: Permission;
    },
  },
  actions: {
    sendSubscriptionRequestForStatusUpdates: sendTo(
      ({ system }) => {
        const actorRef: AnyActorRef = system.get(
          ActorSystemIds.permissionMonitoring
        );
        return actorRef;
      },
      ({ self, context }) => ({
        type: 'subscribeToPermissionStatuses',
        permissions: context.permissions,
        self,
      })
    ),
    sendTriggerPermissionRequest: sendTo(
      ({ system }) => {
        return system.get(ActorSystemIds.permissionCheckerAndRequester);
      },
      ({ event }) => {
        return {
          type: 'triggerPermissionRequest',
          permission: event.permission,
        };
      }
    ),
    checkedSendParent: enqueueActions(
      ({ context, enqueue }, event: AnyEventObject) => {
        if (!context.parent) {
          console.log(
            'WARN: an attempt to send an event to a non-existent parent'
          );
          return;
        }

        enqueue.sendTo(context.parent, event);
      }
    ),
  },
}).createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QAoC2BDAxgCwJYDswBKAYgCcwBHAVzgBcAFMM1XWWXAe3wG0AGALqJQAB04c6XfMJAAPRAFoATADYAnADoA7AFYALDoDMevgb4AOIwBoQAT0QBGPRrVqlai050O3Sh1oBfAJs0LDxCUhFmVnYpAGU6dDpqWABhbHR8GAh+ISQQMQkpGXkEQ3NNFRU+NX8+U3M+LS09G3sEZXMNbz4dJX0DPS1LJyCQjBwCYg0Ad3RcSSySWVhEujANdAAzdbJkPlJQyYjZ+cWoXJlCheL80qG2xG8dDUa9FXMVB0MfwzUVILBED4TgQOAyI7hYhXcQ3bglRQOR5lPgqDQOHS6HT6PzqIxjECQqZEU43LIworwu6OHRotRaJoOBx8QxaJzmJTIr6GDRNczfCzlcx6IaAgJAA */
  description: `
This actor's job is to report permission statuses to the actors that have invoked it. 
We abstract away this functionality so that it is reusable by any actor that needs it 
and so they don't need to know how permissions are checked. This keeps control 
centralized and easy to modify the behavior of.
`,
  context: ({ input }) => ({
    permissions: input.permissions,
    parent: input.parent,
  }),
  id: ActorSystemIds.permissionReporting,
  initial: 'waiting',
  states: {
    waiting: {
      after: {
        /* This is required due to the way actor systems are initialized. Without this delay, the lower level actor (us)
         * will send out the subscription request before the top level permission monitoring actor is ready to receive it.*/
        0: {
          actions: ['sendSubscriptionRequestForStatusUpdates'],
        },
      },
    },
  },
  on: {
    requestPermission: {
      actions: ['sendTriggerPermissionRequest'],
      description: `
This event is sent to the permission reporting machine from its parent feature machine.

This will trigger the "real" check whose results will then be sent to the feature
machine. 
`,
    },
    permissionStatusChanged: {
      description: `
Whenever the Permission Monitoring machine reports that a permission 
status has changed, we receive this event and can process and share 
with the machine in which we are invoked.`,
      actions: [
        {
          /**
           * I tried putting this action in the actions in setup as reportPermissionRequestResult
           * as an action, but it requied
           * use of checkedSendParent and ran into this error when attempting to use that
           *
           * in onDone, but it didn't work
           *
           * error: Type '"checkedSendParent"' is not assignable to type '"triggerPermissionRequest"'.ts(2322)
           */
          type: 'checkedSendParent',
          params({ event }) {
            const { permission, status } = event;
            const permissionEventType = `permissions.${permission}.${status}`;
            return { type: permissionEventType };
          },
        },
      ],
    },
  },
});

export type PermissionReportingActorRef = ActorRefFrom<
  typeof permissionReportingMachine
>;
