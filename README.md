# Pica CLI

Build performant, high-converting native integrations with a few lines of code. By unlocking more integrations, you can
onboard more customers and expand app usage, overnight. 

Visit us at [picaos.com](https://picaos.com)

## Table of Contents

- [Installation](#installation)
- [Docker Setup](#docker-setup)
  - [Start](#start)
  - [Stop](#stop)
- [Initialization](#initialization)
- [Supported Operations](#supported-operations)
- [Commands Reference](#commands)
  - [Common Enums](#common-enums)
    - [List](#list-enum) | [Add](#add-enum) | [Pull](#pull-enum) | [Push](#push-enum) | [Delete](#delete-enum)
  - [Common Models](#common-models)
    - [List](#list-model) | [Add](#add-model) | [Pull](#pull-model) | [Push](#push-model) | [Delete](#delete-model)
  - [Platforms](#platforms)
    - [List](#list-platform) | [Add](#add-platform) | [Pull](#pull-platform) | [Push](#push-platform) | [Delete](#delete-platform)
    - [Additional Platform Operations](#additional-platform-operations)
      - [Add Model](#add-platform-model)
      - [Add OAuth](#add-platform-oauth)
      - [Push Model](#push-platform-model)
      - [Push Action](#push-platform-action)

## Installation

```sh
npm install cios
```

## Docker Setup

### Commands

#### Start

To start the docker containers. All the inputs are required. Seeding is optional, but recommended when running the
command for the first time.

```Shell
cios start
```

##### Example

```Shell
# To start the docker containers
cios start 
Enter the IOS Crypto Secret (32 characters long): xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Do you want to seed? (Y/N) y
```

#### Stop

To stop the docker containers.

```Shell
cios stop
```

## Initialization

To generate the configuration file. All the inputs are optional. Press enter without entering anything to use the
system-default value.

```shell
cios init
```

##### Example

```Shell
# To generate the configuration file
cios init
Enter the Mongo Password: (system default) mongo-password
Enter the Buildable Secret: (system default) buildable-secret
Enter the Default Live Access Key: (system default) default-live-access-key
Enter the Default Test Access Key: (system default) default-test-access-key
Enter the Developer Account Access Key: (system default) developer-account-access-key
Enter the Event Access Password: (system default) event-access-password
Enter the JWT Secret: (system default) jwt-secret
Enter the Gateway Secret: (system default) gateway-secret
Enter the API URL: (system default) api-url
Enter the X IOS Secret: (system default) x-ios-secret
Enter the Bearer Token: (system default) bearer-token
```

## Supported Operations

<table>
    <thead>
        <tr>
            <th rowspan="3">Entity</th>
            <th colspan="8">Operations</th>
            <th rowspan="3" colspan="2">Extra Operations</th>
        </tr>
        <tr>
            <th rowspan="2">List</th>
            <th rowspan="2">Add</th>
            <th colspan="2">Push</th>
            <th colspan="2">Pull</th>
            <th colspan="2">Delete</th>
        </tr>
        <tr>
            <th>All</th>
            <th>Specific</th>
            <th>All</th>
            <th>Specific</th>
            <th>All</th>
            <th>Specific</th>
        </tr>
    </thead>
<tbody>
    <tr style="text-align: center">
        <td>Common Enums</td>
        <td>&#10003;</td>
        <td>&#88;</td>
        <td>&#10003;</td>
        <td>&#10003;</td>
        <td>&#10003;</td>
        <td>&#10003;</td>
        <td>&#88;</td>
        <td>&#88;</td>
        <td colspan="2">&#88;</td>
    </tr>
    <tr style="text-align: center">
        <td>Common Models</td>
        <td>&#10003;</td>
        <td>&#10003;</td>
        <td>&#10003;</td>
        <td>&#10003;</td>
        <td>&#10003;</td>
        <td>&#10003;</td>
        <td>&#88;</td>
        <td>&#10003;</td>
        <td colspan="2">&#88;</td>
    </tr>
    <tr style="text-align: center">
        <td>Platforms</td>
        <td>&#10003;</td>
        <td>&#10003;</td>
        <td>&#10003;</td>
        <td>&#10003;</td>
        <td>&#10003;</td>
        <td>&#10003;</td>
        <td>&#88;</td>
        <td>&#10003;</td>
        <td>Add Model</td>
        <td>Add Oauth</td>
    </tr>
</tbody>
</table>

## Commands

The following commands are available to work with Common Models, Common Enums or Platforms.

### Common Enums

Perform operations on common enums.

#### List

List common enum(s) available in the database.

```Shell
cios list enum
```

#### Add

Add common enum(s) to the repository. A warning will be shown if an enum is already available in the Database.

```Shell
cios add enum
```

##### Example

```Shell
# To add specific enum(s)
cios add enum
Enter the names of enums: UserStatus WebhookState
```

#### Pull

Pull common enum(s) from the database to the repository. One also has the option to validate after the pull is done.
Doing so, will cross-check the data pulled with the data available in the database and notify the user about any
discrepancy.

```Shell
cios pull enum
```

##### Examples

```Shell
# To pull all enums 
cios pull enum
Do you want to pull all common enums? (Y/N) y
Do you want to validate each common enum after pulling? (Y/N) y

# To pull specific enum(s)
cios pull enum
Do you want to pull all common enums? (Y/N) n
Enter the names of enums: AddressType SocialProfileType
Do you want to validate each common enum after pulling? (Y/N) y
```

#### Push

Push common enum(s) from the repository to the database.

```Shell
cios push enum
```

##### Examples

```Shell
# To push all enums 
cios push enum
Do you want to push all common enums? (Y/N) y

# To push specific enum(s)
cios push enum
Do you want to push all common enums? (Y/N) n
Enter the names of enums: EventRuleType TimeCycle
```

#### Delete

Delete common enum(s) from the repository and the database.

```Shell
cios delete enum
```

##### Example

```Shell
# To delete specific enum(s)
cios delete enum
Enter the names of enums: UserStatus TaxType
```

### Common Models

Perform operations on common models.

#### List

List common model(s) available in the database.

```Shell
cios list model
```

#### Add

Add common model(s) to the repository. A warning will be shown if a model is already available in the Database.

```Shell
cios add model
```

##### Example

```Shell
# To add specific model(s)
cios add model
Enter the names of models: Contacts Deals
```

#### Pull

Pull common model(s) from the database to the repository. One also has the option to validate after the pull is done.
Doing so, will cross-check the data pulled with the data available in the database and notify the user about any
discrepancy.

```Shell
cios pull model
```

##### Examples

```Shell
# To pull all models 
cios pull model
Do you want to pull all common models? (Y/N) y
Do you want to validate each common model after pulling? (Y/N) y

# To pull specific model(s)
cios pull model
Do you want to pull all common models? (Y/N) n
Enter the names of models: Customers Webhooks
Do you want to validate each common model after pulling? (Y/N) y
```

#### Push

Push common model(s) from the repository to the database.

```Shell
cios push model
```

##### Examples

```Shell
# To push all models 
cios push model
Do you want to push all common models? (Y/N) y

# To push specific model(s)
cios push model
Do you want to push all common models? (Y/N) n
Enter the names of models: Customers Webhooks
```

#### Delete

Delete common model(s) from the repository and the database.

```Shell
cios delete model
```

##### Example

```Shell
# To delete specific model(s)
cios delete model
Enter the names of models: Leads Opportunities
```

### Platforms

Perform operations on platforms.

#### List

List platform(s) available in the database.

```Shell
cios list platform
```

#### Add

Add platform to the repository. A warning will be shown if a platform is already available in the Database. The default
authentication method is oauth.

```Shell
cios add platform
```

##### Example

```Shell
# To add a platform
cios add platform
Enter the name of the platform: ZenMail
Enter the authentication method (oauth/bearer/basic/apiKey/oauthLegacy/none): (oauth) apiKey
Enter the names of models: Addresses Discounts
```

#### Add Model

Add model(s) to the platform.

```Shell
cios add platformModel
```

##### Example

```Shell
# To add model(s) to a platform
cios addPlatformModel
Enter the name of the platform: BananaShake
Enter the names of models: Accounts Users
```

#### Add OAuth

Add oauth configuration for a platform.

```Shell
cios add platformOAuth
``` 

##### Example

```Shell
# To add oauth for a platform
cios add platformOAuth
Enter the name of the platform: Boogle
```

#### Pull

Pull platform(s) from the database to the repository. One also has the option to validate after the pull is done.
Doing so, will cross-check the data pulled with the data available in the database and notify the user about any
discrepancy.

```Shell
cios pull platform
```

##### Examples

```Shell
# To pull all platforms
cios pull platform
Do you want to pull all platforms? (Y/N) y
Do you want to validate each platform after pulling? (Y/N) y

# To pull specific platform(s)
cios pull platform 
Do you want to pull all platforms? (Y/N)
Enter the names of platforms: FaceGram InstaBook
Do you want to validate each platform after pulling? (Y/N) y
```

#### Push

Push platform(s) from the repository to the database.

```Shell
cios push platform
```

##### Examples

```Shell
# To push all platforms 
cios push platform
Do you want to push all platforms? (Y/N) y
Do you want to set the actions as active? (Y/N) y

# To push specific platform(s)
cios push platform 
Do you want to push all platforms? (Y/N) n
Enter the names of platforms: ShopCommerce Bigify
Do you want to set the actions as active? (Y/N) y
```

#### Push Model

Push platform model(s) from the repository to the database. Pushing the model actions will push all actions.

```Shell
cios push platformModel
```

##### Examples

```Shell
# To push all platform models 
cios push platformModel
Enter the name of the platform: Clove
Do you want to push all the platform models? (Y/N) y
Do you also want to push all the actions in the selected models? (Y/N) y
Do you want to set the actions as active? (Y/N) y

# To push specific platform model(s)
cios push platform Model
Enter the name of the platform: Bean
Do you want to push all the platform models? (Y/N) y
Enter the names of models: Accounts
Do you also want to push all the actions in the selected models? (Y/N) y
Do you want to set the actions as active? (Y/N) y
```

#### Push Actions

Push platform actions from the repository to the database. All actions will be pushed.

```Shell
cios push platformAction
```

##### Examples

```Shell
# To push all platform model actions 
cios push platformAction
Enter the name of the platform: MeetLink
Do you want to push actions for all the platform models? (Y/N) y
Do you want to set the actions as active? (Y/N) y

# To push specific platform model actions
cios push platformAction 
Enter the name of the platform: Chrome
Do you want to push actions for all the platform models? (Y/N) n
Enter the names of models: Accounts
Do you want to set the actions as active? (Y/N) y
```

#### Delete

Delete platform(s) from the repository and the database.

```Shell
cios delete platform
```

##### Example

```Shell
# To delete specific platform(s)
cios delete platform
Enter the names of platforms: Bwitter Orange
```