<template>
  <el-form class="user-info-form" ref="userForm"
    :model="user" 
    :rules="rules"  
  >
    <template v-if="operation==2">
      <el-form-item label="用户名" prop="username">
        <el-input v-model="user.username" type="text" placeholder="请输入你的用户名"></el-input>
      </el-form-item>
      <el-form-item label="密码" prop="password">
          <el-input v-model="user.password" type="password" placeholder="请输入密码"></el-input>
      </el-form-item>
    </template>
    <template v-if="operation!=2">
      <el-form-item label="用户名">
        <el-input disabled v-model="user.username" type="text" placeholder="请输入你的用户名"></el-input>
      </el-form-item>
    </template>
    <template v-if="operation==4">
      <el-form-item label="原密码" prop="old_password">
          <el-input v-model="user.old_password" type="password" placeholder="请输入原密码"></el-input>
      </el-form-item>
    </template>
    <template v-if="operation==3 || operation==4">
      <el-form-item label="新密码" prop="new_password">
          <el-input v-model="user.new_password" type="password" placeholder="请输入新密码"></el-input>
      </el-form-item>
    </template>
    <template v-if="operation!=1">
      <el-form-item label="确认密码" prop="checkPassword">
          <el-input v-model="user.checkPassword" type="password" placeholder="请确认密码"></el-input>
      </el-form-item>
    </template>
    <template v-if="operation==1 || operation==2">
      <el-form-item label="姓名">
        <el-input v-model="user.first_name" type="text" placeholder="请确认真实姓名"></el-input>
      </el-form-item>
      <el-form-item label="邮箱">
          <el-input v-model="user.email" type="text" placeholder="请绑定邮箱"></el-input>
      </el-form-item>
      <el-form-item label="手机号">
          <el-input v-model="user.phone_number" type="text" placeholder="请绑定手机号"></el-input>
      </el-form-item>
      <el-form-item label="单位">
          <el-input v-model="user.workplace" type="text" placeholder="请输入单位"></el-input>
      </el-form-item>
    </template>
  </el-form>
</template>


<script>
export default {
  props:{
    userInfo: {
      type: Object,
      default: ()=>{}
    },
    operation: {
      type: Number,
      default: 2 //默认是用户注册 1表示用户信息修改；2表示用户注册；3表示管理员修改用户密码；4表示用户修改自己密码
    },
  },
  data() {
    /** 自定义验证函数 */ 
    const checkPassword = (rules, value, callback) => {
        if(value!=this.user.password && value!=this.user.new_password){
            callback(new Error("两次密码不一致"));
        }
        else{
            callback();
        }
    }
    const newPassword = (rules, value, callback) => {
        if(value==this.user.old_password){
            callback(new Error("新密码不能和原密码一致"));
        }
        else{
            callback();
        }
    }
    const validatePassword = (rules, value, callback) => {
      const hasLetter = /[A-Za-z]/.test(value);
      const hasNumber = /\d/.test(value);
      const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(value);

      if (!value) {
        return callback(new Error("请输入密码"));
      } else if (!hasLetter || !hasNumber || !hasSpecialChar) {
        return callback(new Error("密码必须包含字母、数字和特殊字符"));
      } else {
        callback();
      }
    };
    return {
        // user : {...this.userInfo},
        rules: {
            username:[
                { required: true, message: '请输入用户名', trigger: 'blur' },
            ],
            password:[
                { required: true, message: '请输入密码', trigger: 'blur' },
                { validator: validatePassword, trigger: 'blur' },
                { min:8, max:30, message: '长度在8-30之间', trigger: 'blur'}
            ],
            old_password:[
                { required: true, message: '请输入密码', trigger: 'blur' },
                { validator: validatePassword, trigger: 'blur' },
                { min:8, max:30, message: '长度在8-30之间', trigger: 'blur'}
            ],
            new_password:[
                { required: true, message: '请输入密码', trigger: 'blur' },
                { validator: validatePassword, trigger: 'blur' },
                { validator: newPassword, trigger: 'blur' },
                { min:8, max:30, message: '长度在8-30之间', trigger: 'blur'}
            ],
            checkPassword:[
                { required: true, message: '请再次输入密码', trigger: 'blur' },
                { validator:checkPassword, trigger: 'blur' },
            ]
        }
    }
  },
  computed: {
    user(){
      return this.userInfo;
    }
  },
  methods: {
    verification() {
      return new Promise((resolve) => {
        this.$refs.userForm.validate((valid) => {
          if (valid) {
            resolve(true);  // 验证通过，解析 Promise
          } else {
            this.$message.error("用户名或密码不符合要求！");
            resolve(false);  // 验证失败，解析 Promise
          }
        });
      });
    }
  }
}
</script>

<style>

</style>