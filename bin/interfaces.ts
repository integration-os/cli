export interface DataObject {
    [key: string]: any;
}

export interface DockerVariables {
    KMS_KEY_ID: string;
    KMS_KEY_RING_ID: string;
    GCP_LOCATION_ID: string;
    GCP_PROJECT_ID: string;
    HOME: string;
    MONGO_PASSWORD: number;
    BUILDABLE_SECRET: string;
    DEFAULT_LIVE_ACCESS_KEY: string;
    DEFAULT_TEST_ACCESS_KEY: string;
    DEVELOPER_ACCOUNT_ACCESS_KEY: string;
    DEVELOPER_ACCOUNT_ID: string;
    EVENT_ACCESS_PASSWORD: string;
    JWT_SECRET: string;
    GATEWAY_SECRET: string;
}