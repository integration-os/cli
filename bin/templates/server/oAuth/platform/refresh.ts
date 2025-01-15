interface DataObject {
    [key: string]: any;
}

export interface OAuthResponse {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    tokenType: string;
    meta: DataObject;
}

export const refresh = async ({ body }: DataObject): Promise<OAuthResponse> => {
    try {
        return {
            accessToken: "",
            refreshToken: "",
            expiresIn: 0,
            tokenType: "",
            meta: {
                ...body.metadata
            }
        };
    } catch (error) {
        throw new Error(`Error fetching access token for PLATFORM_NAME: ${error}`);
    }
};