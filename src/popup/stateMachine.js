import { createMachine, assign, send } from "xstate";
import { isExpired } from "../shared/authStore.js";

export function createAppMachine() {
  return createMachine(
    {
      id: "app",
      predictableActionArguments: true,
      initial: "boot",
      context: {
        auth: null,
        detection: null,
        trackedInfo: null,
        trackedList: [],
        localTracked: {},
        localTrackedList: [],
        error: null,
        loginContact: null,
        verificationCode: null,
        userProfile: null,
        propertyTypes: [],
        signedOut: false,
        pendingRedox: false,
        showLogin: false
      },
      states: {
        boot: {
          invoke: {
            src: "loadBootstrap",
            onDone: {
              target: "ready",
              actions: "setBootstrap"
            },
            onError: {
              target: "ready",
              actions: "setBootstrapError"
            }
          }
        },
        ready: {
          type: "parallel",
          states: {
            auth: {
              initial: "checking",
              states: {
                checking: {
                  always: [
                    { cond: "isAuthenticated", target: "authenticated" },
                    { target: "unauthenticated" }
                  ]
                },
                unauthenticated: {
                  initial: "entering",
                  entry: ["clearError"],
                  states: {
                    entering: {
                      on: {
                        SEND_CODE: {
                          target: "#app.ready.auth.requestingCode",
                          actions: ["setLoginContact", "showLogin"]
                        },
                        SHOW_LOGIN: {
                          actions: "showLogin"
                        }
                      }
                    },
                    awaitingCode: {
                      on: {
                        VERIFY_CODE: "#app.ready.auth.authenticating",
                        SEND_CODE: {
                          target: "#app.ready.auth.requestingCode",
                          actions: ["setLoginContact", "showLogin"]
                        },
                        SHOW_LOGIN: {
                          actions: "showLogin"
                        }
                      }
                    }
                  }
                },
                requestingCode: {
                  invoke: {
                    src: "requestCode",
                    onDone: {
                      target: "unauthenticated.awaitingCode",
                      actions: ["setVerificationCode", "clearError"]
                    },
                    onError: {
                      target: "unauthenticated.entering",
                      actions: "setError"
                    }
                  }
                },
                authenticating: {
                  invoke: {
                    src: "verifyCode",
                    onDone: {
                      target: "authenticated",
                      actions: ["setAuth", "hideLogin", "clearError"]
                    },
                    onError: {
                      target: "unauthenticated.awaitingCode",
                      actions: "setError"
                    }
                  }
                },
                authenticated: {
                  entry: [
                    "persistAuth",
                    "hideLogin",
                    "clearError",
                    "clearSignedOut",
                    "refreshTrackedList"
                  ],
                  invoke: {
                    src: "loadUser",
                    onDone: {
                      actions: [
                        "setUserProfile",
                        "setPropertyTypes",
                        "persistUser",
                        "persistPropertyTypes"
                      ]
                    },
                    onError: [
                      {
                        cond: "isUnauthorized",
                        target: "#app.ready.auth.unauthenticated",
                        actions: [
                          "setSignedOutIfExpired",
                          "clearStoredAuth",
                          "clearStoredUser",
                          "clearStoredPropertyTypes",
                          "clearAuthContext",
                          "showLogin"
                        ]
                      },
                      {
                        actions: "setError"
                      }
                    ]
                  },
                  on: {
                    LOGOUT: {
                      target: "unauthenticated",
                      actions: [
                        "clearStoredAuth",
                        "clearStoredUser",
                        "clearStoredPropertyTypes",
                        "clearSignedOut",
                        "clearAuthContext"
                      ]
                    }
                  }
                }
              }
            },
            currentPage: {
              initial: "detecting",
              states: {
                detecting: {
                  invoke: {
                    src: "detectProperty",
                    onDone: [
                      {
                        cond: "isDetected",
                        target: "checkingTracked",
                        actions: "setDetection"
                      },
                      {
                        target: "notDetected",
                        actions: "clearDetection"
                      }
                    ],
                    onError: {
                      target: "notDetected",
                      actions: "setError"
                    }
                  }
                },
                notDetected: {
                  on: {
                    DETECT: "detecting"
                  }
                },
                checkingTracked: {
                  invoke: {
                    src: "checkTracked",
                    onDone: [
                      {
                        cond: "isAnyTracked",
                        target: "tracked",
                        actions: "setTrackedInfo"
                      },
                      {
                        target: "notTracked",
                        actions: "setTrackedInfo"
                      }
                    ],
                    onError: [
                      {
                        cond: "isUnauthorized",
                        target: "#app.ready.auth.unauthenticated",
                        actions: [
                          "setSignedOutIfExpired",
                          "clearStoredAuth",
                          "clearStoredUser",
                          "clearStoredPropertyTypes",
                          "clearAuthContext",
                          "showLogin"
                        ]
                      },
                      {
                        target: "notTracked",
                        actions: "setError"
                      }
                    ]
                  }
                },
                notTracked: {
                  on: {
                    TRACK_LOCAL: "trackingLocal",
                    SEND_REDOX: [
                      {
                        cond: "isAuthenticated",
                        target: "trackingRedox"
                      },
                      {
                        actions: ["showLogin", "setPendingRedox"]
                      }
                    ],
                    DETECT: "detecting"
                  }
                },
                trackingLocal: {
                  invoke: {
                    src: "trackLocal",
                    onDone: {
                      target: "tracked",
                      actions: ["setLocalTracked", "setTrackedInfo"]
                    },
                    onError: {
                      target: "trackFailed",
                      actions: "setError"
                    }
                  }
                },
                trackingRedox: {
                  invoke: {
                    src: "trackRedox",
                    onDone: {
                      target: "tracked",
                      actions: ["setTrackedInfo", "refreshTrackedList", "clearPendingRedox"]
                    },
                    onError: [
                      {
                        cond: "isUnauthorized",
                        target: "#app.ready.auth.unauthenticated",
                        actions: [
                          "setSignedOutIfExpired",
                          "clearStoredAuth",
                          "clearStoredUser",
                          "clearStoredPropertyTypes",
                          "clearAuthContext",
                          "showLogin"
                        ]
                      },
                      {
                        target: "trackFailed",
                        actions: "setError"
                      }
                    ]
                  }
                },
                tracked: {
                  on: {
                    TRACK_LOCAL: "trackingLocal",
                    SEND_REDOX: [
                      {
                        cond: "isAuthenticated",
                        target: "trackingRedox"
                      },
                      {
                        actions: ["showLogin", "setPendingRedox"]
                      }
                    ],
                    DETECT: "detecting"
                  }
                },
                trackFailed: {
                  on: {
                    TRACK_LOCAL: "trackingLocal",
                    SEND_REDOX: [
                      {
                        cond: "isAuthenticated",
                        target: "trackingRedox"
                      },
                      {
                        actions: ["showLogin", "setPendingRedox"]
                      }
                    ],
                    DETECT: "detecting"
                  }
                }
              }
            },
            trackedList: {
              initial: "loading",
              states: {
                loading: {
                  invoke: {
                    src: "loadTracked",
                    onDone: {
                      target: "loaded",
                      actions: "setTrackedList"
                    },
                    onError: [
                      {
                        cond: "isUnauthorized",
                        target: "#app.ready.auth.unauthenticated",
                        actions: [
                          "setSignedOutIfExpired",
                          "clearStoredAuth",
                          "clearStoredUser",
                          "clearStoredPropertyTypes",
                          "clearAuthContext",
                          "showLogin"
                        ]
                      },
                      {
                        target: "failed",
                        actions: "setError"
                      }
                    ]
                  }
                },
                loaded: {
                  on: {
                    REFRESH: "loading"
                  }
                },
                failed: {
                  on: {
                    REFRESH: "loading"
                  }
                }
              }
            }
          }
        }
      }
    },
    {
      actions: {
        persistAuth: () => {},
        clearStoredAuth: () => {},
        persistUser: () => {},
        clearStoredUser: () => {},
        persistPropertyTypes: () => {},
        clearStoredPropertyTypes: () => {},
        refreshTrackedList: send("REFRESH"),
        setBootstrap: assign({
          auth: (_, event) => event.data?.auth || null,
          localTracked: (_, event) => event.data?.localTracked || {},
          localTrackedList: (_, event) => event.data?.localTrackedList || [],
          userProfile: (_, event) => event.data?.userProfile || null,
          propertyTypes: (_, event) => event.data?.propertyTypes || [],
          signedOut: (_, event) => Boolean(event.data?.signedOut)
        }),
        setBootstrapError: assign({
          auth: null,
          localTracked: {},
          localTrackedList: [],
          userProfile: null,
          propertyTypes: [],
          signedOut: false
        }),
        setAuth: assign({
          auth: (_, event) => event.data
        }),
        clearAuthContext: assign({
          auth: null,
          trackedInfo: null,
          trackedList: [],
          pendingRedox: false,
          showLogin: false,
          loginContact: null,
          verificationCode: null,
          userProfile: null,
          propertyTypes: []
        }),
        setLoginContact: assign({
          loginContact: (_, event) => event.contact,
          verificationCode: () => null
        }),
        setVerificationCode: assign({
          verificationCode: (_, event) => event.data?.verificationCode || null
        }),
        setUserProfile: assign({
          userProfile: (_, event) => event.data?.user || event.data || null
        }),
        setPropertyTypes: assign({
          propertyTypes: (_, event) => event.data?.propertyTypes || []
        }),
        setDetection: assign({
          detection: (_, event) => event.data
        }),
        clearDetection: assign({
          detection: null,
          trackedInfo: null
        }),
        setTrackedInfo: assign((context, event) => {
          const updates = event.data?.localUpdates;
          return {
            trackedInfo: event.data,
            localTracked: updates?.map || context.localTracked,
            localTrackedList: updates?.list || context.localTrackedList
          };
        }),
        setTrackedList: assign({
          trackedList: (_, event) => event.data || []
        }),
        setLocalTracked: assign({
          localTracked: (_, event) => event.data?.map || {},
          localTrackedList: (_, event) => event.data?.list || []
        }),
        setPendingRedox: assign({
          pendingRedox: true
        }),
        clearPendingRedox: assign({
          pendingRedox: false
        }),
        setSignedOutIfExpired: assign((context) => ({
          signedOut: Boolean(context.auth && isExpired(context.auth))
        })),
        clearSignedOut: assign({
          signedOut: false
        }),
        showLogin: assign({
          showLogin: true
        }),
        hideLogin: assign({
          showLogin: false
        }),
        setError: assign({
          error: (_, event) => event.data || event
        }),
        clearError: assign({
          error: null
        })
      },
      guards: {
        isDetected: (_, event) => Boolean(event.data?.detected),
        isAnyTracked: (_, event) => Boolean(event.data?.tracked),
        isUnauthorized: (_, event) => event.data?.code === "unauthorized",
        isAuthenticated: (context) => Boolean(context.auth)
      }
    }
  );
}
